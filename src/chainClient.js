import { Keypair, Transaction } from '@solana/web3.js'
import { Buffer } from 'buffer/'

function defaultSignerUrl() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
    return `${protocol}//${window.location.hostname}:8787`
  }
  return 'http://127.0.0.1:8787'
}

export const OSOCIAL_SIGNER_URL = (import.meta.env.VITE_OSOCIAL_SIGNER_URL || defaultSignerUrl()).replace(/\/$/, '')
export const OSOCIAL_PROGRAM_ID = import.meta.env.VITE_OSOCIAL_PROGRAM_ID || 'EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX'
const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const POST_MEMO_PREFIX = 'osocial:v0:post'
const MAX_POST_MEMO_BYTES = 220
const INSTRUCTION_DISCRIMINATORS = {
  register_profile: 'da7804d202d295ff',
  elnopost: '81ea1a55f5bab221',
  elnoreply: 'da5e84a290e2e50e',
  elnoquote: 'abb04c80b7994698',
  create_post_packet: '276523534b6c1c2d',
}

if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
  globalThis.Buffer = Buffer
}

export function createLocalWallet(secretKey) {
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey))
  return {
    publicKey: keypair.publicKey,
    async signTransaction(tx) {
      tx.partialSign(keypair)
      return tx
    },
  }
}

async function postJson(path, payload) {
  const headers = { 'content-type': 'application/json' }
  let response
  try {
    response = await fetch(`${OSOCIAL_SIGNER_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Osocial signer is not reachable. Keep the local signer running before checking balance or posting.')
  }
  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Signer API returned an unreadable response: ${response.status}`)
  }
  if (!response.ok || json.error) throw new Error(json.error || `Signer API failed: ${response.status}`)
  return json
}

export async function getSignerHealth() {
  let response
  try {
    response = await fetch(`${OSOCIAL_SIGNER_URL}/api/osocial/health`)
  } catch {
    throw new Error('Osocial signer is not reachable. Start the signer, then try again.')
  }
  const text = await response.text()
  let health
  try {
    health = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Signer health returned an unreadable response: ${response.status}`)
  }
  if (!response.ok || health.error) throw new Error(health.error || `Signer health failed: ${response.status}`)
  return health
}

export async function getSolBalanceLamports(publicKey) {
  const result = await postJson('/api/osocial/balance', { userPublicKey: publicKey })
  return Number(result.balanceLamports || 0)
}

export async function checkUsernameAvailability(handle) {
  return postJson('/api/osocial/handle/check', { handle })
}

async function assertSignerReady() {
  const health = await getSignerHealth()
  if (!health.ready) {
    if (!health.authority) throw new Error('Osocial signer is not configured.')
    if (!health.chain?.programDeployed) throw new Error('Osocial program is not deployed on mainnet yet.')
    if (!health.chain?.configReady) throw new Error('Osocial registry config is not initialized on mainnet yet.')
    throw new Error('Osocial signer is not ready.')
  }
}

function instructionDiscriminator(instruction) {
  return Buffer.from(instruction.data).subarray(0, 8).toString('hex')
}

function assertBuiltTransaction(tx, built, wallet, expected = {}) {
  const walletPublicKey = wallet.publicKey
  if (!walletPublicKey) throw new Error('Wallet is not connected.')
  if (built.feePayer !== walletPublicKey.toBase58()) throw new Error('Signer returned a transaction for a different fee payer.')
  if (!tx.feePayer?.equals(walletPublicKey)) throw new Error('Transaction fee payer does not match the connected wallet.')
  if (tx.instructions.length < 1 || tx.instructions.length > 2) throw new Error('Signer transaction contains unexpected extra instructions.')
  const programIx = tx.instructions.find((instruction) => instruction.programId.toBase58() === OSOCIAL_PROGRAM_ID)
  if (!programIx) throw new Error('Signer transaction targets the wrong program.')
  const expectedInstruction = expected.instruction || built.instruction
  const expectedDiscriminator = INSTRUCTION_DISCRIMINATORS[expectedInstruction]
  if (!expectedDiscriminator || instructionDiscriminator(programIx) !== expectedDiscriminator) {
    throw new Error('Signer transaction contains an unexpected Osocial instruction.')
  }
  if (!programIx.keys[0]?.pubkey?.equals(walletPublicKey) || !programIx.keys[0].isSigner || !programIx.keys[0].isWritable) {
    throw new Error('Signer transaction has an invalid user account.')
  }
  if (expectedInstruction === 'register_profile') {
    if (tx.instructions.length !== 1) throw new Error('Registration transaction must not include extra memo instructions.')
    const authorityKey = programIx.keys[1]?.pubkey?.toBase58()
    const profileKey = programIx.keys[3]?.pubkey?.toBase58()
    const handleClaimKey = programIx.keys[4]?.pubkey?.toBase58()
    if (authorityKey !== built.authority || profileKey !== built.profile || handleClaimKey !== built.handleClaim) {
      throw new Error('Registration transaction accounts do not match the signer response.')
    }
  }
  if (expectedInstruction === 'elnopost' || expectedInstruction === 'elnoreply' || expectedInstruction === 'elnoquote') {
    const profileKey = programIx.keys[1]?.pubkey?.toBase58()
    if (profileKey !== built.profile) throw new Error('Post transaction profile account does not match the signer response.')
  }
  if (tx.instructions.length === 2) {
    const memoIx = tx.instructions.find((instruction) => instruction.programId.toBase58() === MEMO_PROGRAM_ID)
    if (!memoIx) throw new Error('Signer transaction contains unexpected extra instructions.')
    const memoText = Buffer.from(memoIx.data).toString('utf8')
    if (
      !memoText.startsWith(POST_MEMO_PREFIX) ||
      Buffer.byteLength(memoText, 'utf8') > MAX_POST_MEMO_BYTES
    ) {
      throw new Error('Signer transaction contains an unexpected memo instruction.')
    }
  }

  if (built.authority) {
    const authoritySignature = tx.signatures.find(({ publicKey }) => publicKey.toBase58() === built.authority)
    if (!authoritySignature?.signature) throw new Error('Transaction is missing the platform co-signature.')
  }
}

async function signAndSend(wallet, built, expected) {
  if (!wallet?.publicKey) throw new Error('Wallet is not connected.')
  if (!wallet.signTransaction) throw new Error('Wallet does not support signTransaction.')

  const tx = Transaction.from(fromBase64(built.tx))
  assertBuiltTransaction(tx, built, wallet, expected)
  const signed = await wallet.signTransaction(tx)
  const sent = await postJson('/api/osocial/send', {
    tx: toBase64(signed.serialize()),
    blockhash: built.blockhash,
    lastValidBlockHeight: built.lastValidBlockHeight,
    feePayer: built.feePayer,
  })
  return { ...built, ...sent }
}

function fromBase64(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunk))
  }
  return btoa(binary)
}

export async function uploadMediaForPost(file) {
  if (!file) throw new Error('Choose an image or video first.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  return postJson('/api/osocial/media/upload', {
    name: file.name,
    type: file.type,
    dataBase64: toBase64(bytes),
  })
}

export async function registerProfileOnMainnet({ wallet, userPublicKey, handle, displayName }) {
  await assertSignerReady()
  const built = await postJson('/api/osocial/register/build', {
    userPublicKey,
    handle,
    displayName,
  })
  return signAndSend(wallet, built, { instruction: 'register_profile' })
}

export async function getProfile(userPublicKey) {
  await assertSignerReady()
  return postJson('/api/osocial/profile', { userPublicKey })
}

export async function createPostOnMainnet({ wallet, userPublicKey, packet, memoPreview }) {
  await assertSignerReady()
  const built = await postJson('/api/osocial/post/build', {
    userPublicKey,
    packet,
    memoPreview,
  })
  return signAndSend(wallet, built, { instruction: 'elnopost' })
}

export async function createReplyOnMainnet({ wallet, userPublicKey, packet, replyTo, memoPreview }) {
  await assertSignerReady()
  const built = await postJson('/api/osocial/post/build', {
    userPublicKey,
    packet,
    memoPreview,
    kind: 'reply',
    ref: replyTo,
  })
  return signAndSend(wallet, built, { instruction: 'elnoreply' })
}

export async function createQuoteOnMainnet({ wallet, userPublicKey, packet, quoteOf, memoPreview }) {
  await assertSignerReady()
  const built = await postJson('/api/osocial/post/build', {
    userPublicKey,
    packet,
    memoPreview,
    kind: 'quote',
    ref: quoteOf,
  })
  return signAndSend(wallet, built, { instruction: 'elnoquote' })
}
