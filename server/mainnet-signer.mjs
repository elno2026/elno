import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { extname, join } from 'node:path'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'

const DEFAULT_PROGRAM_ID = 'EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX'
const DEFAULT_PLATFORM_AUTHORITY = '89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF'
const DEFAULT_TREASURY = '89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF'
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const POST_MEMO_PREFIX = 'osocial:v0:post'
const MAX_POST_MEMO_BYTES = 220
const MAX_HANDLE_BYTES = 32
const MIN_USERNAME_CHARS = 3
const MAX_USERNAME_CHARS = 30
const MAX_DISPLAY_NAME_BYTES = 64
const PROGRAM_MAX_EVENT_POST_PACKET_BYTES = 1024
const MAX_POST_PACKET_BYTES = Math.min(Number(process.env.OSOCIAL_MAX_POST_PACKET_BYTES || PROGRAM_MAX_EVENT_POST_PACKET_BYTES), PROGRAM_MAX_EVENT_POST_PACKET_BYTES)
const MAX_SERIALIZED_TRANSACTION_BYTES = 1232
const LAMPORTS_PER_SOL = 1_000_000_000
const PROFILE_ACCOUNT_SPACE = 8 + 32 + (4 + MAX_HANDLE_BYTES) + (4 + MAX_DISPLAY_NAME_BYTES) + 8 + 8 + 8 + 1 + 1
const HANDLE_CLAIM_ACCOUNT_SPACE = 8 + 32 + 32 + (4 + MAX_HANDLE_BYTES) + 1
const DEFAULT_MIN_USER_BALANCE_LAMPORTS = 50_000

const PORT = Number(process.env.OSOCIAL_SIGNER_PORT || 8787)
const HOST = process.env.OSOCIAL_SIGNER_HOST || '127.0.0.1'
const TLS_KEY = process.env.OSOCIAL_SIGNER_TLS_KEY || ''
const TLS_CERT = process.env.OSOCIAL_SIGNER_TLS_CERT || ''
const RPC_URL = process.env.MAINNET_RPC_URL || process.env.OSOCIAL_RPC_URL || 'https://api.mainnet-beta.solana.com'
const PROGRAM_ID = new PublicKey(process.env.OSOCIAL_PROGRAM_ID || DEFAULT_PROGRAM_ID)
const EXPECTED_AUTHORITY = new PublicKey(process.env.OSOCIAL_PLATFORM_AUTHORITY || DEFAULT_PLATFORM_AUTHORITY)
const TREASURY = new PublicKey(process.env.OSOCIAL_TREASURY || DEFAULT_TREASURY)
const ALLOWED_ORIGIN = process.env.OSOCIAL_ALLOWED_ORIGIN || ''
const SIGNER_API_KEY = process.env.OSOCIAL_SIGNER_API_KEY || ''
const REQUIRE_USER_ALLOWLIST = process.env.OSOCIAL_REQUIRE_USER_ALLOWLIST === 'true'
const ALLOWED_USERS = new Set(
  (process.env.OSOCIAL_ALLOWED_USERS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)
const MAX_BODY_BYTES = Number(process.env.OSOCIAL_MAX_BODY_BYTES || 8192)
const MEDIA_DIR = process.env.OSOCIAL_MEDIA_DIR || '.media'
const MEDIA_PUBLIC_BASE_URL = process.env.OSOCIAL_PUBLIC_MEDIA_BASE_URL || ''
const MEDIA_MAX_BYTES = Number(process.env.OSOCIAL_MEDIA_MAX_BYTES || 10 * 1024 * 1024)
const MEDIA_BODY_MAX_BYTES = Number(process.env.OSOCIAL_MEDIA_BODY_MAX_BYTES || Math.ceil(MEDIA_MAX_BYTES * 1.4) + 4096)
const MEDIA_TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
])
const RATE_LIMIT_WINDOW_MS = Number(process.env.OSOCIAL_RATE_LIMIT_WINDOW_MS || 60_000)
const RATE_LIMIT_MAX = Number(process.env.OSOCIAL_RATE_LIMIT_MAX || 60)
const MIN_USER_BALANCE_LAMPORTS = parseLamports(
  process.env.OSOCIAL_MIN_USER_BALANCE_LAMPORTS,
  DEFAULT_MIN_USER_BALANCE_LAMPORTS,
)
const MIN_USER_BALANCE_LABEL = process.env.OSOCIAL_MIN_USER_BALANCE_LABEL || 'small gas buffer'
const REGISTRATION_PRICE_USD = process.env.OSOCIAL_REGISTRATION_PRICE_USD || process.env.OSOCIAL_USERNAME_PRICE_USD || '1'
const REGISTRATION_PRICE_LABEL = process.env.OSOCIAL_REGISTRATION_PRICE_LABEL || `${formatUsdLabel(REGISTRATION_PRICE_USD)} username`
const USERNAME_CLAIM_EVENT_ENABLED = process.env.OSOCIAL_USERNAME_CLAIM_EVENT_ENABLED === 'true'
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.OSOCIAL_ENV === 'production'
const PUBLIC_SIGNER_ALLOWED = process.env.OSOCIAL_PUBLIC_SIGNER === 'true'
const rateBuckets = new Map()
const connection = new Connection(RPC_URL, 'confirmed')
const tlsOptions = TLS_KEY && TLS_CERT ? {
  key: readFileSync(TLS_KEY),
  cert: readFileSync(TLS_CERT),
} : null
const protocol = tlsOptions ? 'https' : 'http'

function parseLamports(value, fallback) {
  if (value === undefined || value === '') return BigInt(fallback)
  if (!/^\d+$/.test(String(value))) throw new Error(`Invalid lamport amount: ${value}`)
  return BigInt(value)
}

function loadAuthority() {
  const secret = process.env.OSOCIAL_AUTHORITY_SECRET_KEY
  const path = process.env.OSOCIAL_AUTHORITY_KEYPAIR

  if (!secret && !path) {
    throw new Error('Set OSOCIAL_AUTHORITY_SECRET_KEY or OSOCIAL_AUTHORITY_KEYPAIR before running the signer.')
  }

  const raw = secret || readFileSync(path, 'utf8')
  const values = raw.trim().startsWith('[') ? JSON.parse(raw) : raw.split(',').map((value) => Number(value.trim()))
  const keypair = Keypair.fromSecretKey(Uint8Array.from(values))

  if (!keypair.publicKey.equals(EXPECTED_AUTHORITY)) {
    throw new Error(`Authority mismatch: signer=${keypair.publicKey.toBase58()} expected=${EXPECTED_AUTHORITY.toBase58()}`)
  }

  return keypair
}

let authority
try {
  authority = loadAuthority()
} catch (error) {
  console.error(`[osocial signer] ${error.message}`)
  if (IS_PRODUCTION) process.exit(1)
}

if (IS_PRODUCTION && !PUBLIC_SIGNER_ALLOWED && !SIGNER_API_KEY && !REQUIRE_USER_ALLOWLIST && ALLOWED_USERS.size === 0) {
  throw new Error('Production signer requires OSOCIAL_SIGNER_API_KEY, a user allowlist, or explicit OSOCIAL_PUBLIC_SIGNER=true.')
}

function json(res, status, payload) {
  res.writeHead(status, {
    'access-control-allow-origin': ALLOWED_ORIGIN || '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-osocial-signer-key',
    'content-type': 'application/json',
  })
  if (status === 204) {
    res.end()
    return
  }
  res.end(JSON.stringify(payload))
}

async function readJson(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) throw new Error(`Request body exceeds ${maxBytes} bytes.`)
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

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

function requestPath(req) {
  return new URL(req.url || '/', 'http://osocial.local').pathname
}

function extensionForMedia(type, name) {
  const safeType = String(type || '').split(';')[0].trim().toLowerCase()
  if (MEDIA_TYPES.has(safeType)) return MEDIA_TYPES.get(safeType)
  const ext = extname(String(name || '')).toLowerCase()
  if ([...MEDIA_TYPES.values()].includes(ext)) return ext
  return ''
}

function sniffMediaType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  const header = bytes.subarray(0, 16).toString('ascii')
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif'
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 16).toString('ascii')
    if (brand.includes('avif') || brand.includes('avis')) return 'image/avif'
    if (brand.includes('qt  ')) return 'video/quicktime'
    return 'video/mp4'
  }
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm'
  return ''
}

function mediaTypeForFilename(filename) {
  const ext = extname(filename).toLowerCase()
  for (const [type, knownExt] of MEDIA_TYPES) {
    if (knownExt === ext) return type
  }
  return 'application/octet-stream'
}

function publicMediaBaseUrl(req) {
  if (MEDIA_PUBLIC_BASE_URL) return MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const requestProtocol = forwardedProto || protocol
  const host = req.headers.host || `${HOST}:${PORT}`
  return `${requestProtocol}://${host}`
}

function uploadMedia(body, req) {
  const claimedType = String(body.type || '').split(';')[0].trim().toLowerCase()
  if (claimedType && !MEDIA_TYPES.has(claimedType)) throw new Error('Media must be an image or video file.')

  const rawBase64 = String(body.dataBase64 || '')
  const dataBase64 = rawBase64.includes(',') ? rawBase64.split(',').pop() : rawBase64
  if (!dataBase64) throw new Error('Media upload is missing file data.')

  const bytes = Buffer.from(dataBase64, 'base64')
  if (!bytes.length) throw new Error('Media upload is empty.')
  if (bytes.length > MEDIA_MAX_BYTES) throw new Error(`Media file exceeds ${MEDIA_MAX_BYTES} bytes.`)

  const type = sniffMediaType(bytes)
  if (!type || !MEDIA_TYPES.has(type)) throw new Error('Media file type is not supported.')
  if (claimedType && claimedType !== type && !(claimedType === 'video/quicktime' && type === 'video/mp4')) {
    throw new Error('Media file contents do not match the declared file type.')
  }
  const ext = extensionForMedia(type, body.name)
  if (!ext) throw new Error('Media file type is not supported.')

  const digest = createHash('sha256').update(bytes).digest()
  const hash = digest.toString('hex')
  const filename = `${hash}${ext}`
  const mediaPath = `/media/${filename}`
  const mediaId = filename
  const shortPath = `/m/${filename}`
  mkdirSync(MEDIA_DIR, { recursive: true })
  try {
    writeFileSync(join(MEDIA_DIR, filename), bytes, { flag: 'wx' })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }

  return {
    url: `${publicMediaBaseUrl(req)}${mediaPath}`,
    shortUrl: `${publicMediaBaseUrl(req)}${shortPath}`,
    mediaPath,
    shortPath,
    mediaId,
    mediaUri: `osocial://media/${mediaId}`,
    hash: `sha256:${hash}`,
    integrity: `sha256-${digest.toString('base64')}`,
    kind: type,
    bytes: bytes.length,
    filename,
    hostedBy: 'osocial-media-v0',
    immutable: true,
  }
}

function serveMedia(req, res, pathname) {
  const prefix = pathname.startsWith('/m/') ? '/m/' : '/media/'
  const filename = decodeURIComponent(pathname.slice(prefix.length))
  if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(filename)) {
    return json(res, 404, { error: 'Media not found' })
  }
  let stats
  const filePath = join(MEDIA_DIR, filename)
  try {
    stats = statSync(filePath)
  } catch {
    return json(res, 404, { error: 'Media not found' })
  }
  res.writeHead(200, {
    'access-control-allow-origin': ALLOWED_ORIGIN || '*',
    'cache-control': 'public, max-age=31536000, immutable',
    'content-length': stats.size,
    'content-type': mediaTypeForFilename(filename),
    'x-osocial-content-address': `sha256:${filename.split('.')[0]}`,
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath).pipe(res)
}

function assertOrigin(req) {
  if (!ALLOWED_ORIGIN) return
  const origin = req.headers.origin
  if (origin && origin !== ALLOWED_ORIGIN) throw new Error('Origin is not allowed.')
}

function secretsEqual(a, b) {
  const left = createHash('sha256').update(String(a)).digest()
  const right = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(left, right)
}

function assertApiKey(req) {
  if (!SIGNER_API_KEY) return
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const key = req.headers['x-osocial-signer-key'] || bearer
  if (!secretsEqual(key, SIGNER_API_KEY)) throw new Error('Signer API key is invalid.')
}

function assertRateLimit(req) {
  const key = req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  if (rateBuckets.size > RATE_LIMIT_MAX * 20) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey)
    }
  }
  const current = rateBuckets.get(key)
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return
  }
  current.count += 1
  if (current.count > RATE_LIMIT_MAX) throw new Error('Signer rate limit exceeded.')
}

function assertSignerAccess(req) {
  assertRateLimit(req)
  assertOrigin(req)
  assertApiKey(req)
}

function assertAllowedUser(user) {
  const publicKey = user.toBase58()
  if ((REQUIRE_USER_ALLOWLIST || ALLOWED_USERS.size > 0) && !ALLOWED_USERS.has(publicKey)) {
    throw new Error(`Wallet ${publicKey} is not approved for Osocial signing.`)
  }
}

function formatSol(lamports) {
  const whole = lamports / BigInt(LAMPORTS_PER_SOL)
  const fraction = (lamports % BigInt(LAMPORTS_PER_SOL)).toString().padStart(9, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction} SOL` : `${whole} SOL`
}

function formatUsdLabel(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return `$${value}`
  const options = {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 4,
  }
  return `$${numeric.toLocaleString(undefined, options)}`
}

function formatRegistrationFee(lamports) {
  // Durust etiket: zincirde ucret 0 ise "$1 username" yazma.
  if (lamports === 0n) return 'Username free now'
  return `${REGISTRATION_PRICE_LABEL} (${formatSol(lamports)})`
}

// Canli SOL/USD (CoinGecko), 60sn cache. Hata olursa son bilinen degeri dondurur.
const SOL_USD_PRICE_URL =
  process.env.OSOCIAL_SOL_PRICE_URL ||
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
let solUsdCache = { value: null, at: 0 }
async function getSolUsd() {
  if (process.env.OSOCIAL_SOL_USD) return Number(process.env.OSOCIAL_SOL_USD)
  const now = Date.now()
  if (solUsdCache.value && now - solUsdCache.at < 60_000) return solUsdCache.value
  try {
    // 2sn timeout: fiyat best-effort, cekirdek imza yolunu asla bloklama
    const r = await fetch(SOL_USD_PRICE_URL, { signal: AbortSignal.timeout(2000) })
    const j = await r.json()
    const v = Number(j?.solana?.usd)
    if (Number.isFinite(v) && v > 0) {
      solUsdCache = { value: v, at: now }
      return v
    }
  } catch {
    /* timeout/agda sorun olursa son cache (veya null) */
  }
  return solUsdCache.value
}
function lamportsToUsd(lamports, solUsd) {
  if (!solUsd) return null
  return (Number(lamports) / LAMPORTS_PER_SOL) * solUsd
}
function formatUsd(value) {
  if (value == null) return null
  return `$${value.toFixed(value < 1 ? 4 : 2)}`
}

async function assertMinimumUserBalance(user, extraLamports = 0n) {
  const balance = BigInt(await connection.getBalance(user, 'confirmed'))
  const required = MIN_USER_BALANCE_LAMPORTS + extraLamports
  if (required > 0n && balance < required) {
    throw new Error(
      `Wallet needs enough SOL for username claim costs before Osocial can sign. Required now: ${formatSol(required)}.`,
    )
  }
  return balance
}

async function getUserBalance(body) {
  const user = new PublicKey(body.userPublicKey)
  assertAllowedUser(user)
  const balance = BigInt(await connection.getBalance(user, 'confirmed'))
  const chain = await getProgramState()
  const registrationFeeLamports = BigInt(chain.registrationFeeLamports || '0')
  const registrationRentLamports = await getRegistrationRentLamports()
  const requiredRegistrationBalanceLamports = registrationFeeLamports + registrationRentLamports + MIN_USER_BALANCE_LAMPORTS
  const solUsd = await getSolUsd()
  return {
    userPublicKey: user.toBase58(),
    balanceLamports: balance.toString(),
    balanceSol: formatSol(balance),
    minUserBalanceLamports: MIN_USER_BALANCE_LAMPORTS.toString(),
    minUserBalanceLabel: MIN_USER_BALANCE_LABEL,
    registrationFeeLamports: registrationFeeLamports.toString(),
    registrationFeeLabel: formatRegistrationFee(registrationFeeLamports),
    registrationPriceUsd: REGISTRATION_PRICE_USD,
    registrationPriceLabel: REGISTRATION_PRICE_LABEL,
    registrationRentLamports: registrationRentLamports.toString(),
    registrationRentLabel: formatSol(registrationRentLamports),
    requiredRegistrationBalanceLamports: requiredRegistrationBalanceLamports.toString(),
    requiredRegistrationBalanceLabel: formatSol(requiredRegistrationBalanceLamports),
    solUsd: solUsd ? String(solUsd) : null,
    registrationFeeUsd: formatUsd(lamportsToUsd(registrationFeeLamports, solUsd)),
    requiredRegistrationBalanceUsd: formatUsd(lamportsToUsd(requiredRegistrationBalanceLamports, solUsd)),
    balanceUsd: formatUsd(lamportsToUsd(balance, solUsd)),
    funded: balance >= requiredRegistrationBalanceLamports,
  }
}

async function checkHandleAvailability(body) {
  const handle = normalizeHandle(body.handle)
  assertValidHandle(handle)
  await assertProgramReady()
  const { handleClaim } = registryPdas(EXPECTED_AUTHORITY, handle)
  const account = await connection.getAccountInfo(handleClaim, 'confirmed')
  return {
    handle,
    username: `@${handle}`,
    available: !account,
    handleClaim: handleClaim.toBase58(),
  }
}

function utf8Length(value) {
  return Buffer.byteLength(value, 'utf8')
}

function normalizeHandle(handle) {
  return String(handle || '').trim().replace(/^@/, '').toLowerCase()
}

function assertValidHandle(handle) {
  if (!handle) throw new Error('Handle cannot be empty.')
  if (handle.length < MIN_USERNAME_CHARS) throw new Error(`Username must be at least ${MIN_USERNAME_CHARS} characters.`)
  if (handle.length > MAX_USERNAME_CHARS || utf8Length(handle) > MAX_HANDLE_BYTES) {
    throw new Error(`Username must be ${MAX_USERNAME_CHARS} characters or less.`)
  }
  if (!/^[a-z0-9._]+$/.test(handle)) throw new Error('Username can only use English letters, numbers, underscores, or dots.')
  if (!/^[a-z0-9]/.test(handle) || !/[a-z0-9]$/.test(handle)) throw new Error('Username must start and end with a letter or number.')
  if (/[._]{2}/.test(handle)) throw new Error('Username cannot use consecutive dots or underscores.')
}

function assertDisplayName(displayName) {
  if (utf8Length(displayName) > MAX_DISPLAY_NAME_BYTES) throw new Error(`Display name exceeds ${MAX_DISPLAY_NAME_BYTES} bytes.`)
}

function assertPacket(packet) {
  if (!String(packet || '').trim()) throw new Error('Post packet cannot be empty.')
  if (utf8Length(packet) > MAX_POST_PACKET_BYTES) throw new Error(`Post packet exceeds ${MAX_POST_PACKET_BYTES} bytes.`)
}

function discriminator(name) {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8)
}

function accountDiscriminator(name) {
  return createHash('sha256').update(`account:${name}`).digest().subarray(0, 8)
}

function encodeString(value) {
  const bytes = Buffer.from(value, 'utf8')
  const length = Buffer.alloc(4)
  length.writeUInt32LE(bytes.length)
  return Buffer.concat([length, bytes])
}

function encodeRegisterProfile(handle, displayName) {
  return Buffer.concat([discriminator('register_profile'), encodeString(handle), encodeString(displayName)])
}

function encodeCreatePost(packet) {
  return Buffer.concat([discriminator('create_post'), encodeString(packet)])
}

function encodeCreatePostPacket(packet) {
  return Buffer.concat([discriminator('create_post_packet'), encodeString(packet)])
}

function encodeOsocialPost(packet) {
  return Buffer.concat([discriminator('elnopost'), encodeString(packet)])
}

function truncateUtf8(value, maxBytes) {
  const chars = Array.from(value)
  let out = ''
  for (const char of chars) {
    const next = out + char
    if (Buffer.byteLength(next, 'utf8') > maxBytes) break
    out = next
  }
  return out
}

function normalizePostMemoPreview(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildPostMemo(preview) {
  const normalized = normalizePostMemoPreview(preview)
  if (!normalized) return POST_MEMO_PREFIX
  const budget = MAX_POST_MEMO_BYTES - Buffer.byteLength(`${POST_MEMO_PREFIX}:`, 'utf8')
  return `${POST_MEMO_PREFIX}:${truncateUtf8(normalized, budget)}`
}

function pda(seedParts) {
  return PublicKey.findProgramAddressSync(seedParts, PROGRAM_ID)[0]
}

function registryPdas(user, handle) {
  const userKey = new PublicKey(user)
  return {
    config: pda([Buffer.from('config')]),
    profile: pda([Buffer.from('profile'), userKey.toBuffer()]),
    handleClaim: handle ? pda([Buffer.from('handle'), Buffer.from(handle, 'utf8')]) : null,
  }
}

async function getProgramState() {
  const { config } = registryPdas(authority?.publicKey || EXPECTED_AUTHORITY)
  const [programAccount, configAccount] = await Promise.all([
    connection.getAccountInfo(PROGRAM_ID, 'confirmed'),
    connection.getAccountInfo(config, 'confirmed'),
  ])

  const state = {
    programDeployed: Boolean(programAccount?.executable),
    config: config.toBase58(),
    configReady: false,
    configAuthority: null,
    configTreasury: null,
    registrationFeeLamports: null,
  }

  if (!programAccount?.executable || !configAccount) return state
  if (!configAccount.owner.equals(PROGRAM_ID)) return state

  const data = Buffer.from(configAccount.data)
  const expected = accountDiscriminator('RegistryConfig')
  if (data.length < 81 || !data.subarray(0, 8).equals(expected)) return state

  const configAuthority = new PublicKey(data.subarray(8, 40))
  const configTreasury = new PublicKey(data.subarray(40, 72))
  state.configAuthority = configAuthority.toBase58()
  state.configTreasury = configTreasury.toBase58()
  state.registrationFeeLamports = data.readBigUInt64LE(72).toString()
  state.configReady = configAuthority.equals(EXPECTED_AUTHORITY) && configTreasury.equals(TREASURY)
  return state
}

async function getRegistrationRentLamports() {
  const [profileRent, handleRent] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(PROFILE_ACCOUNT_SPACE, 'confirmed'),
    connection.getMinimumBalanceForRentExemption(HANDLE_CLAIM_ACCOUNT_SPACE, 'confirmed'),
  ])
  return BigInt(profileRent + handleRent)
}

async function assertProgramReady() {
  const state = await getProgramState()
  if (!state.programDeployed) throw new Error(`Program ${PROGRAM_ID.toBase58()} is not deployed on mainnet-beta.`)
  if (!state.configReady) throw new Error(`Registry config ${state.config} is not initialized for this authority/treasury.`)
  return state
}

function parseProfileState(accountData) {
  const expected = accountDiscriminator('Profile')
  if (accountData.length < 8 || !accountData.subarray(0, 8).equals(expected)) {
    throw new Error('Profile account has an invalid discriminator.')
  }

  let offset = 8 + 32
  if (accountData.length < offset + 4) throw new Error('Profile account data is truncated.')
  const handleLength = accountData.readUInt32LE(offset)
  const handle = accountData.subarray(offset + 4, offset + 4 + handleLength).toString('utf8')
  offset += 4 + handleLength
  if (accountData.length < offset + 4) throw new Error('Profile account data is truncated.')
  const displayNameLength = accountData.readUInt32LE(offset)
  offset += 4 + displayNameLength
  offset += 8 // created_at
  offset += 8 // paid_lamports
  if (accountData.length < offset + 8) throw new Error('Profile account data is truncated.')
  const postCount = accountData.readBigUInt64LE(offset)
  offset += 8
  if (accountData.length < offset + 1) throw new Error('Profile account data is missing active status.')
  const active = accountData[offset] === 1
  if (postCount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Profile post_count exceeds safe JavaScript integer range.')
  return { active, postCount: Number(postCount), handle }
}

// Bir cuzdanin on-chain profilini (handle + durum) dondurur. Key ile girise (loginWithKey) hizmet eder.
async function getProfileMeta(body) {
  const user = new PublicKey(body.userPublicKey)
  const { profile } = registryPdas(user)
  const info = await connection.getAccountInfo(profile, 'confirmed')
  if (!info || !info.owner.equals(PROGRAM_ID)) return { exists: false, registered: false }
  try {
    const { active, postCount, handle } = parseProfileState(Buffer.from(info.data))
    return { exists: true, registered: true, active, postCount, handle }
  } catch {
    return { exists: false, registered: false }
  }
}

async function buildBaseTransaction(userPublicKey) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({
    feePayer: new PublicKey(userPublicKey),
    recentBlockhash: blockhash,
  })
  return { tx, blockhash, lastValidBlockHeight }
}

function serializePartiallySigned(tx) {
  tx.partialSign(authority)
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64')
}

function serializeUnsigned(tx) {
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64')
}

function serializePostTransaction(tx) {
  try {
    return serializeUnsigned(tx)
  } catch (error) {
    throw new Error(
      `Post packet does not fit in one Solana transaction. Serialized transactions must stay under ${MAX_SERIALIZED_TRANSACTION_BYTES} bytes. Shorten the text or media metadata and try again.`,
    )
  }
}

function encodeElno(kind, packet, ref) {
  if (kind === 'reply') return Buffer.concat([discriminator('elnoreply'), encodeString(packet), encodeString(ref)])
  if (kind === 'quote') return Buffer.concat([discriminator('elnoquote'), encodeString(packet), encodeString(ref)])
  return encodeOsocialPost(packet)
}

function addOsocialPostInstruction(tx, user, profile, packet, kind = 'post', ref = '') {
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: profile, isSigner: false, isWritable: true },
      ],
      data: encodeElno(kind, packet, ref),
    }),
  )
}

async function buildRegister(body) {
  if (!authority) throw new Error('Signer is not configured.')
  const user = new PublicKey(body.userPublicKey)
  assertAllowedUser(user)
  const handle = normalizeHandle(body.handle)
  const displayName = String(body.displayName || '').trim()
  assertValidHandle(handle)
  assertDisplayName(displayName)
  const state = await assertProgramReady()
  const registrationFeeLamports = BigInt(state.registrationFeeLamports || '0')
  const registrationRentLamports = await getRegistrationRentLamports()
  const requiredRegistrationBalanceLamports = MIN_USER_BALANCE_LAMPORTS + registrationFeeLamports + registrationRentLamports
  const userBalance = await assertMinimumUserBalance(user, registrationFeeLamports + registrationRentLamports)

  const { config, profile, handleClaim } = registryPdas(user, handle)
  const { tx, blockhash, lastValidBlockHeight } = await buildBaseTransaction(user)

  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: profile, isSigner: false, isWritable: true },
        { pubkey: handleClaim, isSigner: false, isWritable: true },
        { pubkey: TREASURY, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeRegisterProfile(handle, displayName),
    }),
  )

  return {
    tx: serializePartiallySigned(tx),
    blockhash,
    lastValidBlockHeight,
    instruction: 'register_profile',
    event: USERNAME_CLAIM_EVENT_ENABLED ? 'UsernameClaimed' : 'ProfileRegistered',
    events: USERNAME_CLAIM_EVENT_ENABLED ? ['ProfileRegistered', 'UsernameClaimed'] : ['ProfileRegistered'],
    handle,
    username: `@${handle}`,
    profile: profile.toBase58(),
    handleClaim: handleClaim.toBase58(),
    usernameIndex: handleClaim.toBase58(),
    authority: authority.publicKey.toBase58(),
    treasury: TREASURY.toBase58(),
    feePayer: user.toBase58(),
    storageMode: 'profile+handle_claim',
    expectedBaseFeeLamports: '10000',
    userBalanceLamports: userBalance.toString(),
    minUserBalanceLamports: MIN_USER_BALANCE_LAMPORTS.toString(),
    registrationFeeLamports: registrationFeeLamports.toString(),
    registrationFeeLabel: formatRegistrationFee(registrationFeeLamports),
    registrationPriceUsd: REGISTRATION_PRICE_USD,
    registrationPriceLabel: REGISTRATION_PRICE_LABEL,
    registrationRentLamports: registrationRentLamports.toString(),
    requiredUserBalanceLamports: requiredRegistrationBalanceLamports.toString(),
    requiredRegistrationBalanceLamports: requiredRegistrationBalanceLamports.toString(),
    requiredRegistrationBalanceLabel: formatSol(requiredRegistrationBalanceLamports),
  }
}

async function buildPost(body) {
  if (!authority) throw new Error('Signer is not configured.')
  const user = new PublicKey(body.userPublicKey)
  assertAllowedUser(user)
  const packet = String(body.packet || '')
  const kind = body.kind === 'reply' || body.kind === 'quote' ? body.kind : 'post'
  const ref = String(body.ref || '')
  if ((kind === 'reply' || kind === 'quote') && (!ref.trim() || Buffer.byteLength(ref, 'utf8') > 96)) {
    throw new Error('Reply/quote requires a valid parent reference (max 96 bytes).')
  }
  const memo = buildPostMemo(body.memoPreview)
  assertPacket(packet)
  await assertProgramReady()

  const { profile } = registryPdas(user)
  const profileAccount = await connection.getAccountInfo(profile, 'confirmed')
  if (!profileAccount) throw new Error('Profile account not found. Register before posting.')
  if (!profileAccount.owner.equals(PROGRAM_ID)) throw new Error('Profile account is not owned by the Osocial program.')
  const { active, postCount: sequence } = parseProfileState(Buffer.from(profileAccount.data))
  if (!active) throw new Error('Profile is disabled by the registry authority.')
  const { tx, blockhash, lastValidBlockHeight } = await buildBaseTransaction(user)

  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(memo, 'utf8'),
    }),
  )
  addOsocialPostInstruction(tx, user, profile, packet, kind, ref)

  let serializedTx
  let includedMemo = memo
  try {
    serializedTx = serializeUnsigned(tx)
  } catch {
    const retryTx = new Transaction({
      feePayer: user,
      recentBlockhash: blockhash,
    })
    addOsocialPostInstruction(retryTx, user, profile, packet, kind, ref)
    serializedTx = serializePostTransaction(retryTx)
    includedMemo = ''
  }

  return {
    tx: serializedTx,
    blockhash,
    lastValidBlockHeight,
    profile: profile.toBase58(),
    post: null,
    sequence,
    authority: null,
    feePayer: user.toBase58(),
    storageMode: 'event',
    instruction: kind === 'reply' ? 'elnoreply' : kind === 'quote' ? 'elnoquote' : 'elnopost',
    memo: includedMemo,
    memoIncluded: Boolean(includedMemo),
    expectedBaseFeeLamports: '5000',
  }
}

function fromBase64Transaction(value) {
  if (!value || typeof value !== 'string') throw new Error('Signed transaction is missing.')
  return Transaction.from(Buffer.from(value, 'base64'))
}

function assertSignedOsocialTransaction(tx, expectedFeePayer) {
  if (!tx.feePayer) throw new Error('Signed transaction is missing a fee payer.')
  if (expectedFeePayer && tx.feePayer.toBase58() !== expectedFeePayer) {
    throw new Error('Signed transaction fee payer does not match the requested wallet.')
  }
  if (tx.instructions.length < 1 || tx.instructions.length > 2) throw new Error('Signed transaction contains unexpected extra instructions.')
  const programIx = tx.instructions.find((instruction) => instruction.programId.equals(PROGRAM_ID))
  if (!programIx) throw new Error('Signed transaction targets the wrong program.')

  const ixDiscriminator = Buffer.from(programIx.data).subarray(0, 8)
  const isRegister = ixDiscriminator.equals(discriminator('register_profile'))
  const isCheapPost = ixDiscriminator.equals(discriminator('elnopost'))
  const isReply = ixDiscriminator.equals(discriminator('elnoreply'))
  const isQuote = ixDiscriminator.equals(discriminator('elnoquote'))
  const isPost = isCheapPost || isReply || isQuote
  if (!isRegister && !isPost) throw new Error('Signed transaction instruction is not allowed.')
  if (isRegister && tx.instructions.length !== 1) throw new Error('Registration transaction cannot include extra instructions.')
  if (!programIx.keys[0]?.pubkey?.equals(tx.feePayer) || !programIx.keys[0].isSigner || !programIx.keys[0].isWritable) {
    throw new Error('Signed transaction has an invalid user signer account.')
  }
  if (tx.instructions.length === 2) {
    const memoIx = tx.instructions.find((instruction) => instruction.programId.equals(MEMO_PROGRAM_ID))
    if (!memoIx) throw new Error('Signed transaction contains unexpected extra instructions.')
    const memoText = Buffer.from(memoIx.data).toString('utf8')
    if (
      !isPost ||
      !memoText.startsWith(POST_MEMO_PREFIX) ||
      Buffer.byteLength(memoText, 'utf8') > MAX_POST_MEMO_BYTES
    ) {
      throw new Error('Signed transaction contains an unexpected memo instruction.')
    }
  }

  if (isRegister) {
    if (!authority) throw new Error('Signer is not configured.')
    const authoritySignature = tx.signatures.find(({ publicKey }) => publicKey.equals(authority.publicKey))
    if (!authoritySignature?.signature) throw new Error('Signed transaction is missing the platform authority signature.')
  }

  if (!tx.verifySignatures(true)) throw new Error('Signed transaction signatures are invalid or incomplete.')
}

async function sendSignedTransaction(body) {
  const tx = fromBase64Transaction(body.tx)
  assertSignedOsocialTransaction(tx, body.feePayer ? String(body.feePayer) : '')
  if (body.blockhash && String(body.blockhash) !== tx.recentBlockhash) {
    throw new Error('Signed transaction blockhash does not match the signer response.')
  }
  const lastValidBlockHeight = Number(body.lastValidBlockHeight || 0)
  if (!Number.isSafeInteger(lastValidBlockHeight) || lastValidBlockHeight <= 0) {
    throw new Error('Signed transaction is missing a valid lastValidBlockHeight.')
  }
  let signature
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      maxRetries: 3,
      skipPreflight: false,
    })
  } catch (error) {
    if (typeof error?.getLogs === 'function') {
      try {
        error.logs = await error.getLogs(connection)
      } catch {
        // Keep the original send error when logs cannot be fetched.
      }
    }
    throw error
  }
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: tx.recentBlockhash,
      lastValidBlockHeight,
    },
    'confirmed',
  )
  if (confirmation.value.err) throw new Error(`Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`)
  return { signature }
}

function friendlyErrorMessage(error) {
  const message = error?.message || String(error || 'Signer request failed.')
  const logs = Array.isArray(error?.logs) ? error.logs.join('\n') : ''
  const combined = `${message}\n${logs}`
  if (combined.includes('InstructionFallbackNotFound') || combined.includes('custom program error: 0x65')) {
    return 'Mainnet program is still on the old version and does not support elnopost yet. Upgrade the Elno program, then restart the signer and try again.'
  }
  return message
}

const requestHandler = async (req, res) => {
  try {
    const pathname = requestPath(req)
    if (req.method === 'OPTIONS') return json(res, 204, {})

    if (req.method === 'GET' && pathname === '/api/osocial/health') {
      const chain = await getProgramState()
      const registrationFeeLamports = BigInt(chain.registrationFeeLamports || '0')
      const registrationRentLamports = await getRegistrationRentLamports()
      const requiredRegistrationBalanceLamports = MIN_USER_BALANCE_LAMPORTS + registrationFeeLamports + registrationRentLamports
      const solUsd = await getSolUsd()
      return json(res, 200, {
        ready: Boolean(authority) && chain.programDeployed && chain.configReady,
        signerConfigured: Boolean(authority),
        cluster: 'mainnet-beta',
        rpcUrl: redactUrl(RPC_URL),
        programId: PROGRAM_ID.toBase58(),
        authority: authority?.publicKey.toBase58() || null,
        treasury: TREASURY.toBase58(),
        maxPostPacketBytes: MAX_POST_PACKET_BYTES,
        minUserBalanceLamports: MIN_USER_BALANCE_LAMPORTS.toString(),
        minUserBalanceLabel: MIN_USER_BALANCE_LABEL,
        registrationFeeLamports: registrationFeeLamports.toString(),
        registrationFeeLabel: formatRegistrationFee(registrationFeeLamports),
        registrationPriceUsd: REGISTRATION_PRICE_USD,
        registrationPriceLabel: REGISTRATION_PRICE_LABEL,
        registrationRentLamports: registrationRentLamports.toString(),
        registrationRentLabel: formatSol(registrationRentLamports),
        requiredRegistrationBalanceLamports: requiredRegistrationBalanceLamports.toString(),
        requiredRegistrationBalanceLabel: formatSol(requiredRegistrationBalanceLamports),
        solUsd: solUsd ? String(solUsd) : null,
        registrationFeeUsd: formatUsd(lamportsToUsd(registrationFeeLamports, solUsd)),
        requiredRegistrationBalanceUsd: formatUsd(lamportsToUsd(requiredRegistrationBalanceLamports, solUsd)),
        protected: {
          apiKey: Boolean(SIGNER_API_KEY),
          allowedOrigin: ALLOWED_ORIGIN || null,
          userAllowlist: REQUIRE_USER_ALLOWLIST || ALLOWED_USERS.size > 0,
          rateLimitMax: RATE_LIMIT_MAX,
          maxBodyBytes: MAX_BODY_BYTES,
        },
        mediaUpload: {
          enabled: true,
          maxBytes: MEDIA_MAX_BYTES,
          publicBaseUrl: MEDIA_PUBLIC_BASE_URL ? 'configured' : null,
          types: [...MEDIA_TYPES.keys()],
        },
        chain,
      })
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && (pathname.startsWith('/media/') || pathname.startsWith('/m/'))) {
      return serveMedia(req, res, pathname)
    }

    if (req.method === 'POST' && pathname === '/api/osocial/media/upload') {
      assertSignerAccess(req)
      return json(res, 200, uploadMedia(await readJson(req, MEDIA_BODY_MAX_BYTES), req))
    }

    if (req.method === 'POST' && pathname === '/api/osocial/register/build') {
      assertSignerAccess(req)
      return json(res, 200, await buildRegister(await readJson(req)))
    }

    if (req.method === 'POST' && pathname === '/api/osocial/handle/check') {
      assertSignerAccess(req)
      return json(res, 200, await checkHandleAvailability(await readJson(req)))
    }

    if (req.method === 'POST' && pathname === '/api/osocial/post/build') {
      assertSignerAccess(req)
      return json(res, 200, await buildPost(await readJson(req)))
    }

    if (req.method === 'POST' && pathname === '/api/osocial/balance') {
      assertSignerAccess(req)
      return json(res, 200, await getUserBalance(await readJson(req)))
    }

    if (req.method === 'POST' && pathname === '/api/osocial/profile') {
      assertSignerAccess(req)
      return json(res, 200, await getProfileMeta(await readJson(req)))
    }

    if (req.method === 'POST' && pathname === '/api/osocial/send') {
      assertSignerAccess(req)
      return json(res, 200, await sendSignedTransaction(await readJson(req)))
    }

    return json(res, 404, { error: 'Not found' })
  } catch (error) {
    return json(res, 400, { error: friendlyErrorMessage(error) })
  }
}

const server = tlsOptions ? https.createServer(tlsOptions, requestHandler) : http.createServer(requestHandler)

server.listen(PORT, HOST, () => {
  console.log(`[osocial signer] listening on ${protocol}://${HOST}:${PORT}`)
  console.log(`[osocial signer] program=${PROGRAM_ID.toBase58()} rpc=${redactUrl(RPC_URL)}`)
})
