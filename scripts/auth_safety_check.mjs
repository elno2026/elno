import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const main = readFileSync(join(root, 'src/main.jsx'), 'utf8')
const chainClient = readFileSync(join(root, 'src/chainClient.js'), 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`auth safety check failed: ${message}`)
    process.exitCode = 1
  }
}

assert(main.includes("ACCOUNTS_STORAGE_KEY = 'osocial-accounts-v2'"), 'auth must use the v2 multi-account store')
assert(main.includes('findDuplicateAccount({ handle })'), 'signup must check duplicate handles before creating a wallet')
assert(main.includes('That username already has a draft or account here'), 'duplicate signup must route users back to login')
assert(main.includes('loadUnlockedWallet(saved)'), 'refresh must restore only the active unlocked wallet session')
assert(main.includes('verifyWalletLocally(currentUser)'), 'wallet verification must prove local wallet ownership')
assert(main.includes('Verify your wallet before publishing.'), 'publishing must require wallet verification')
assert(main.includes('Verify your wallet before activating your on-chain profile.'), 'activation must require wallet verification')
assert(main.includes("kdf: 'DEVICE-AES-GCM'"), 'new accounts must use the passwordless device vault')
assert(main.includes('indexedDB.open(DEVICE_VAULT_DB_NAME'), 'device vault key must be stored outside localStorage')
assert(main.includes('setPendingSession(session)'), 'signup must stop at the funding gate before opening the app')
assert(main.includes('Register now to claim this username on-chain'), 'username must only be claimed after funding')
assert(main.includes('recoveryVault'), 'recovery wallet login must use an encrypted app-wallet vault')
assert(!main.includes('recoveryWalletProof'), 'recovery wallet must not store a signature proof')
assert(!main.includes('walletVerificationProof'), 'local wallet verification must not store a signature proof')
assert(!main.includes('ed25519'), 'auth must not store or verify signature proofs in the client state')
assert(!main.includes('Copy recovery key'), 'recovery key must not be exposed as a one-click copy action')
assert(!main.includes('Export recovery key'), 'app wallet private key export must not be shown in normal UI')
assert(!main.includes('<span>Password</span>'), 'normal auth must not show a password field')
assert(!main.includes('password.trim().length'), 'normal auth must not block on password length')
assert(!/localStorage\.setItem\([^)]*walletSecretKey/s.test(main), 'raw wallet secret must not be written to localStorage')
assert(!main.includes('secretKey: Array.from(session.walletSecretKey)'), 'raw wallet secret must not be written to sessionStorage')
assert(!/author:\s*publishingUser/.test(main), 'published posts must not store the full unlocked user object')

assert(chainClient.includes('assertBuiltTransaction'), 'frontend must validate signer-built transactions before signing')
assert(chainClient.includes('unexpected extra instructions'), 'frontend must reject transactions with extra instructions')
assert(!chainClient.includes('VITE_OSOCIAL_SIGNER_API_KEY'), 'frontend must not expose signer API secrets')

if (!process.exitCode) {
  console.log('auth safety check passed')
}
