import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { formatUsd, resolveRegistrationFeeLamports } from './registration_pricing.mjs'

const DEFAULT_PROGRAM_ID = 'EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX'
const MAX_REGISTRATION_FEE_LAMPORTS = 1_000_000_000n

const rpcUrl = process.env.MAINNET_RPC_URL || process.env.OSOCIAL_RPC_URL || 'https://api.mainnet-beta.solana.com'
const programId = new PublicKey(process.env.OSOCIAL_PROGRAM_ID || DEFAULT_PROGRAM_ID)
const authorityPath = process.env.OSOCIAL_AUTHORITY_KEYPAIR

if (!authorityPath) {
  throw new Error('Set OSOCIAL_AUTHORITY_KEYPAIR to the platform authority keypair path.')
}

const execute = process.argv.includes('--yes-mainnet')
const dryRun = !execute || process.argv.includes('--dry-run') || process.env.OSOCIAL_DRY_RUN === 'true'
if (!dryRun && process.env.OSOCIAL_CONFIRM_MAINNET !== programId.toBase58()) {
  throw new Error(`Refusing to mutate mainnet. Set OSOCIAL_CONFIRM_MAINNET=${programId.toBase58()} and pass --yes-mainnet.`)
}
if (!dryRun && !process.env.OSOCIAL_REGISTRATION_FEE_LAMPORTS && !process.env.OSOCIAL_SOL_USD) {
  throw new Error('Mainnet fee changes require OSOCIAL_REGISTRATION_FEE_LAMPORTS or pinned OSOCIAL_SOL_USD.')
}

const registrationPricing = await resolveRegistrationFeeLamports()
const feeLamports = registrationPricing.feeLamports
if (feeLamports > MAX_REGISTRATION_FEE_LAMPORTS) {
  throw new Error(`Registration fee ${feeLamports} exceeds cap ${MAX_REGISTRATION_FEE_LAMPORTS}.`)
}
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(authorityPath, 'utf8'))))
const connection = new Connection(rpcUrl, 'confirmed')
const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId)

const data = Buffer.alloc(16)
createHash('sha256').update('global:set_registration_fee').digest().copy(data, 0, 0, 8)
data.writeBigUInt64LE(feeLamports, 8)

const tx = new Transaction().add(
  new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: true },
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
  throw new Error(`set_registration_fee simulation failed: ${JSON.stringify(simulation.value.err)}\n${(simulation.value.logs || []).join('\n')}`)
}

let signature = null
if (!dryRun) {
  signature = await connection.sendRawTransaction(tx.serialize(), {
    maxRetries: 3,
    skipPreflight: false,
  })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
}

console.log(
  JSON.stringify(
    {
      updated: !dryRun,
      dryRun,
      signature,
      programId: programId.toBase58(),
      config: config.toBase58(),
      authority: authority.publicKey.toBase58(),
      simulationOk: true,
      simulatedComputeUnits: simulation.value.unitsConsumed ?? null,
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
