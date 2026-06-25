import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { formatUsd, resolveRegistrationFeeLamports } from './registration_pricing.mjs'

const DEFAULT_PROGRAM_ID = 'EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX'
const DEFAULT_TREASURY = '89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF'
const MAX_REGISTRATION_FEE_LAMPORTS = 1_000_000_000n

const rpcUrl = process.env.MAINNET_RPC_URL || process.env.OSOCIAL_RPC_URL || 'https://api.mainnet-beta.solana.com'
const programId = new PublicKey(process.env.OSOCIAL_PROGRAM_ID || DEFAULT_PROGRAM_ID)
const treasury = new PublicKey(process.env.OSOCIAL_TREASURY || DEFAULT_TREASURY)
const authorityPath = process.env.OSOCIAL_AUTHORITY_KEYPAIR

if (!authorityPath) {
  throw new Error('Set OSOCIAL_AUTHORITY_KEYPAIR to the platform authority keypair path.')
}

const execute = process.argv.includes('--yes-mainnet')
const dryRun = !execute || process.argv.includes('--dry-run') || process.env.OSOCIAL_DRY_RUN === 'true'
if (!dryRun && process.env.OSOCIAL_CONFIRM_MAINNET !== programId.toBase58()) {
  throw new Error(`Refusing to initialize mainnet config. Set OSOCIAL_CONFIRM_MAINNET=${programId.toBase58()} and pass --yes-mainnet.`)
}

const registrationPricing = await resolveRegistrationFeeLamports()
const feeLamports = registrationPricing.feeLamports
if (feeLamports > MAX_REGISTRATION_FEE_LAMPORTS) {
  throw new Error(`Registration fee ${feeLamports} exceeds cap ${MAX_REGISTRATION_FEE_LAMPORTS}.`)
}
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(authorityPath, 'utf8'))))
const connection = new Connection(rpcUrl, 'confirmed')
const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId)

function accountDiscriminator(name) {
  return createHash('sha256').update(`account:${name}`).digest().subarray(0, 8)
}

const [programAccount, configAccount] = await Promise.all([
  connection.getAccountInfo(programId, 'confirmed'),
  connection.getAccountInfo(config, 'confirmed'),
])

if (!programAccount?.executable) {
  throw new Error(`Program ${programId.toBase58()} is not deployed on mainnet-beta.`)
}

if (configAccount) {
  const data = Buffer.from(configAccount.data)
  const expected = accountDiscriminator('RegistryConfig')
  if (!configAccount.owner.equals(programId) || data.length < 81 || !data.subarray(0, 8).equals(expected)) {
    throw new Error(`Config PDA ${config.toBase58()} exists but is not a valid Osocial RegistryConfig.`)
  }
  const configAuthority = new PublicKey(data.subarray(8, 40))
  const configTreasury = new PublicKey(data.subarray(40, 72))
  const existingFee = data.readBigUInt64LE(72)
  if (!configAuthority.equals(authority.publicKey) || !configTreasury.equals(treasury)) {
    throw new Error('Existing config authority/treasury does not match this environment.')
  }
  console.log(JSON.stringify({ initialized: true, dryRun, config: config.toBase58(), authority: configAuthority.toBase58(), treasury: configTreasury.toBase58(), registrationFeeLamports: existingFee.toString() }, null, 2))
  process.exit(0)
}

const data = Buffer.alloc(16)
createHash('sha256').update('global:initialize_config').digest().copy(data, 0, 0, 8)
data.writeBigUInt64LE(feeLamports, 8)

const tx = new Transaction().add(
  new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  }),
)

const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
tx.feePayer = authority.publicKey
tx.recentBlockhash = blockhash
tx.sign(authority)
const simulation = await connection.simulateTransaction(tx)
if (simulation.value.err) {
  throw new Error(`initialize_config simulation failed: ${JSON.stringify(simulation.value.err)}\n${(simulation.value.logs || []).join('\n')}`)
}

let signature = null
if (!dryRun) {
  signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3, skipPreflight: false })
  const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  if (confirmation.value.err) throw new Error(`Initialization confirmation failed: ${JSON.stringify(confirmation.value.err)}`)
}

console.log(
  JSON.stringify(
    {
      initialized: true,
      dryRun,
      simulationOk: true,
      signature,
      programId: programId.toBase58(),
      config: config.toBase58(),
      authority: authority.publicKey.toBase58(),
      treasury: treasury.toBase58(),
      registrationFeeLamports: feeLamports.toString(),
      registrationPricingMode: registrationPricing.mode,
      registrationPriceUsd: registrationPricing.priceUsd,
      registrationPriceLabel: registrationPricing.priceUsd ? `${formatUsd(registrationPricing.priceUsd)} per username` : null,
      solUsd: registrationPricing.solUsd,
      priceSource: registrationPricing.priceSource,
    },
    null,
    2,
  ),
)
