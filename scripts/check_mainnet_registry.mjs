import { createHash } from 'node:crypto'
import { Connection, PublicKey } from '@solana/web3.js'

const DEFAULT_PROGRAM_ID = 'EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX'
const DEFAULT_PLATFORM_AUTHORITY = '89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF'
const DEFAULT_TREASURY = '89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF'

const rpcUrl = process.env.MAINNET_RPC_URL || process.env.OSOCIAL_RPC_URL || 'https://api.mainnet-beta.solana.com'
const programId = new PublicKey(process.env.OSOCIAL_PROGRAM_ID || DEFAULT_PROGRAM_ID)
const expectedAuthority = new PublicKey(process.env.OSOCIAL_PLATFORM_AUTHORITY || DEFAULT_PLATFORM_AUTHORITY)
const expectedTreasury = new PublicKey(process.env.OSOCIAL_TREASURY || DEFAULT_TREASURY)
const connection = new Connection(rpcUrl, 'confirmed')

function redactUrl(value) {
  try {
    const url = new URL(value)
    if (url.search) url.search = '?redacted=true'
    if (url.username) url.username = 'redacted'
    if (url.password) url.password = 'redacted'
    return url.toString()
  } catch {
    return 'configured'
  }
}

function accountDiscriminator(name) {
  return createHash('sha256').update(`account:${name}`).digest().subarray(0, 8)
}

const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId)
const [programAccount, configAccount] = await Promise.all([
  connection.getAccountInfo(programId, 'confirmed'),
  connection.getAccountInfo(config, 'confirmed'),
])

const result = {
  rpcUrl: redactUrl(rpcUrl),
  programId: programId.toBase58(),
  programDeployed: Boolean(programAccount?.executable),
  config: config.toBase58(),
  configReady: false,
  configAuthority: null,
  configTreasury: null,
  registrationFeeLamports: null,
}

if (configAccount?.owner.equals(programId)) {
  const data = Buffer.from(configAccount.data)
  const expected = accountDiscriminator('RegistryConfig')
  if (data.length >= 81 && data.subarray(0, 8).equals(expected)) {
    const configAuthority = new PublicKey(data.subarray(8, 40))
    const configTreasury = new PublicKey(data.subarray(40, 72))
    result.configAuthority = configAuthority.toBase58()
    result.configTreasury = configTreasury.toBase58()
    result.registrationFeeLamports = data.readBigUInt64LE(72).toString()
    result.configReady = configAuthority.equals(expectedAuthority) && configTreasury.equals(expectedTreasury)
  }
}

result.ready = result.programDeployed && result.configReady
console.log(JSON.stringify(result, null, 2))

if (!result.ready) {
  process.exitCode = 1
}
