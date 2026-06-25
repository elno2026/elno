import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Bell,
  Braces,
  Check,
  Copy,
  Database,
  Eye,
  Fingerprint,
  Home,
  Image,
  KeyRound,
  Link,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Quote,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Upload,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import brotliPromise from 'brotli-wasm'
import { Keypair, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import {
  checkUsernameAvailability,
  createLocalWallet,
  createPostOnMainnet,
  createReplyOnMainnet,
  createQuoteOnMainnet,
  getProfile,
  getSignerHealth,
  getSolBalanceLamports,
  OSOCIAL_SIGNER_URL,
  registerProfileOnMainnet,
  uploadMediaForPost,
} from './chainClient.js'
import { decodePacketMemo, makePacket } from './packetCodec.js'
import {
  createPeerInvite,
  decryptPeerText,
  encryptPeerText,
  generatePeerIdentity,
} from './peerCrypto.js'
import './styles.css'

const enc = new TextEncoder()

const MAINNET_TX =
  '4HSYgUx7TacfqicUzJS83CNYdaad8s4M1vzNQNeSFtFF8hrkwUGUfNuLzwsYGCk2kvy97BPRgjM22fZvN1mLbC9g'

const SOL_MEDIA =
  'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'

const REGISTRY_PROGRAM_ID = 'EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX'
const PLATFORM_AUTHORITY = '89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF'
const REGISTRY_TREASURY = '89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF'
const REGISTRATION_FEE_LABEL = 'Username free now · only rent + network fee'
const SINGLE_TX_SOFT_PACKET_BYTES = 960
const MAX_HANDLE_BYTES = 32
const MIN_USERNAME_CHARS = 3
const MAX_USERNAME_CHARS = 30
const MAX_DISPLAY_NAME_BYTES = 64
const DEFAULT_MIN_USER_BALANCE_LAMPORTS = 50_000
const ACCOUNTS_STORAGE_KEY = 'osocial-accounts-v2'
const ACTIVE_ACCOUNT_STORAGE_KEY = 'osocial-active-account-v2'
const ACCOUNT_STORAGE_KEY = 'osocial-account-v1'
const LEGACY_ACCOUNT_STORAGE_KEY = 'osocial-session-v1'
const AUTH_STORAGE_KEY = 'osocial-authenticated-v1'
const UNLOCKED_WALLET_STORAGE_KEY = 'osocial-unlocked-wallet-v1'
const UNLOCKED_WALLETS_STORAGE_KEY = 'osocial-unlocked-wallets-v2'
const POSTS_STORAGE_KEY = 'osocial-posts-v2'
const DEVICE_VAULT_DB_NAME = 'osocial-device-vault'
const DEVICE_VAULT_STORE_NAME = 'keys'
const DEVICE_VAULT_KEY_ID = 'app-wallet-aes-gcm-v1'

const seedPosts = [
  {
    id: 'post-mainnet-proof',
    author: {
      name: 'Elno',
      handle: '@elno',
      wallet: '89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF',
      accent: '#a36bff',
    },
    createdAt: '2m',
    text: 'Real mainnet crypto media post test from on-chain social. Text lives as a packet, media lives as URI + hash, and the feed is open to any indexer.',
    media: {
      kind: 'image/png',
      url: SOL_MEDIA,
      hash: 'sha256:943c48e760ec717f55363835067d501ff4bd6825a29732a18955e141ba536602',
    },
    proofTx: MAINNET_TX,
    stats: { replies: 12, reposts: 48, likes: 201 },
    liked: false,
    reposted: false,
    saved: true,
    packetMode: 'json',
    replies: [
      {
        id: 'reply-1',
        author: 'Helius watcher',
        text: 'Prefix indexing is the next unlock.',
      },
    ],
  },
  {
    id: 'post-agi',
    author: {
      name: 'AGI Signal',
      handle: '@agisignal',
      wallet: 'AGI9kE7f2aCaaProtocolWallet',
      accent: '#159db2',
    },
    createdAt: '14m',
    text: 'Autistic Genius Intelligence is not just a rename. It is a social object: pattern recognition, recursion, hyper-focus, and a network that can prove its own memory.',
    media: null,
    proofTx: '',
    stats: { replies: 6, reposts: 19, likes: 88 },
    liked: true,
    reposted: false,
    saved: false,
    packetMode: 'br',
    replies: [],
  },
  {
    id: 'post-builder',
    author: {
      name: 'Builder Desk',
      handle: '@builder',
      wallet: 'B1drWalletOpenSocialGraph',
      accent: '#6457c8',
    },
    createdAt: '31m',
    text: 'The product is simple: wallet signs, post packet lands, indexers read, clients compete. The API is the chain.',
    media: null,
    proofTx: '',
    stats: { replies: 3, reposts: 22, likes: 64 },
    liked: false,
    reposted: true,
    saved: false,
    packetMode: 'br',
    replies: [],
  },
]

const navItems = [
  { id: 'feed', label: 'Feed', icon: Home },
  { id: 'messages', label: 'Messages', icon: MessageCircle, soon: true },
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'packets', label: 'Packets', icon: Braces },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function byteLength(value) {
  return enc.encode(value).length
}

function truncateUtf8(value, maxBytes) {
  let output = ''
  for (const char of Array.from(String(value || ''))) {
    const next = output + char
    if (byteLength(next) > maxBytes) break
    output = next
  }
  return output
}

function osocialMediaUrlFromId(mediaId) {
  const clean = String(mediaId || '').replace(/^osocial:\/\/media\//, '').replace(/^\/?(?:media|m)\//, '')
  if (!/^[a-f0-9]{64}\.[a-z0-9]+$/i.test(clean)) return ''
  return `${OSOCIAL_SIGNER_URL}/media/${clean.toLowerCase()}`
}

function resolveMediaUrl(media) {
  return osocialMediaUrlFromId(media?.id || media?.mediaId || media?.i) || media?.url || ''
}

function buildPostMemoPreview({ text, mediaUrl, mediaId }) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim()
  const cleanMediaId = String(mediaId || '').trim()
  const cleanMediaUrl = String(mediaUrl || '').trim()
  if (!cleanMediaId && !cleanMediaUrl) return cleanText || 'text post'

  const mediaProof = `media=${cleanMediaId || cleanMediaUrl}`
  if (!cleanText) return mediaProof

  const separator = ' text='
  const textBudget = 200 - byteLength(mediaProof) - byteLength(separator)
  if (textBudget <= 8) return truncateUtf8(mediaProof, 200)
  return `${mediaProof}${separator}${truncateUtf8(cleanText, textBudget)}`
}

function shortAddress(value, head = 6, tail = 4) {
  if (!value) return ''
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function validateSignupInput({ name, handle, wallet }) {
  const cleanHandle = handle.trim().replace(/^@/, '').toLowerCase()
  if (!cleanHandle) return 'Handle cannot be empty.'
  if (cleanHandle.length < MIN_USERNAME_CHARS) return `Username must be at least ${MIN_USERNAME_CHARS} characters.`
  if (cleanHandle.length > MAX_USERNAME_CHARS || byteLength(cleanHandle) > MAX_HANDLE_BYTES) {
    return `Username must be ${MAX_USERNAME_CHARS} characters or less.`
  }
  if (!/^[a-z0-9._]+$/.test(cleanHandle)) return 'Username can only use English letters, numbers, underscores, or dots.'
  if (!/^[a-z0-9]/.test(cleanHandle) || !/[a-z0-9]$/.test(cleanHandle)) return 'Username must start and end with a letter or number.'
  if (/[._]{2}/.test(cleanHandle)) return 'Username cannot use consecutive dots or underscores.'
  if (byteLength(name.trim()) > MAX_DISPLAY_NAME_BYTES) return `Display name must be ${MAX_DISPLAY_NAME_BYTES} bytes or less.`

  if (wallet) {
    try {
      new PublicKey(wallet.trim())
    } catch {
      return 'Wallet address must be a valid Solana public key.'
    }
  }

  return ''
}

function base64Url(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunk))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function parseSecretKeyImport(value) {
  const clean = value.trim()
  if (!clean) throw new Error('Paste your private key, or create a new wallet.')

  // base58 (kayitta gosterdigimiz key formati) — once bunu dene
  if (!clean.startsWith('[') && !clean.includes(',')) {
    try {
      const decoded = bs58.decode(clean)
      if (decoded.length === 64) return Uint8Array.from(decoded)
    } catch {
      /* base58 degil, asagida array olarak dene */
    }
    throw new Error('That does not look like a valid private key.')
  }

  // JSON array veya virgullu 64-bayt
  const values = clean.startsWith('[') ? JSON.parse(clean) : clean.split(',').map((part) => Number(part.trim()))
  if (!Array.isArray(values) || values.length !== 64 || values.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new Error('Imported key must be a base58 private key or 64-byte array.')
  }
  return Uint8Array.from(values)
}

function publicKeyFromSecret(secretKey) {
  return Keypair.fromSecretKey(Uint8Array.from(secretKey)).publicKey.toBase58()
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeHandle(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase()
}

async function deriveVaultKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function openDeviceVaultDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('This browser cannot create a device vault. Use a modern browser or wallet browser.'))
      return
    }

    const request = indexedDB.open(DEVICE_VAULT_DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DEVICE_VAULT_STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Device vault could not open.'))
  })
}

function idbRequest(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DEVICE_VAULT_STORE_NAME, mode)
    const store = tx.objectStore(DEVICE_VAULT_STORE_NAME)
    const request = action(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Device vault request failed.'))
    tx.onerror = () => reject(tx.error || new Error('Device vault transaction failed.'))
  })
}

async function getDeviceVaultKey() {
  const db = await openDeviceVaultDb()
  try {
    const stored = await idbRequest(db, 'readonly', (store) => store.get(DEVICE_VAULT_KEY_ID))
    if (stored) return stored

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await idbRequest(db, 'readwrite', (store) => store.put(key, DEVICE_VAULT_KEY_ID))
    return key
  } finally {
    db.close()
  }
}

function isDeviceVault(vault) {
  return vault?.kdf === 'DEVICE-AES-GCM'
}

function isLegacyPasswordVault(vault) {
  return vault?.kdf === 'PBKDF2-SHA256'
}

async function encryptDeviceSecretKey(secretKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await getDeviceVaultKey()
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, secretKey)
  return {
    v: 2,
    kdf: 'DEVICE-AES-GCM',
    iv: base64Url(iv),
    ciphertext: base64Url(new Uint8Array(ciphertext)),
  }
}

async function decryptDeviceSecretKey(vault) {
  const key = await getDeviceVaultKey()
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(vault.iv) }, key, fromBase64Url(vault.ciphertext))
  return new Uint8Array(plain)
}

async function deriveSignatureVaultKey(signature, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', signature, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptSecretKey(secretKey, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const iterations = 210_000
  const key = await deriveVaultKey(password, salt, iterations)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, secretKey)
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: base64Url(salt),
    iv: base64Url(iv),
    ciphertext: base64Url(new Uint8Array(ciphertext)),
  }
}

async function decryptSecretKey(vault, password) {
  const key = await deriveVaultKey(password, fromBase64Url(vault.salt), vault.iterations)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(vault.iv) }, key, fromBase64Url(vault.ciphertext))
  return new Uint8Array(plain)
}

async function encryptRecoverySecretKey(secretKey, signature) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const iterations = 180_000
  const key = await deriveSignatureVaultKey(signature, salt, iterations)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, secretKey)
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256-ED25519-SIGNATURE',
    iterations,
    salt: base64Url(salt),
    iv: base64Url(iv),
    ciphertext: base64Url(new Uint8Array(ciphertext)),
  }
}

async function decryptRecoverySecretKey(vault, signature) {
  const key = await deriveSignatureVaultKey(signature, fromBase64Url(vault.salt), vault.iterations)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(vault.iv) }, key, fromBase64Url(vault.ciphertext))
  return new Uint8Array(plain)
}

function toStoredSession(session) {
  const { walletSecretKey, secretKey, privateKey, ...stored } = session || {}
  return { ...stored, id: accountIdFor(stored) }
}

function accountIdFor(account) {
  return account?.id || account?.wallet || `${account?.email || 'account'}:${account?.handle || ''}`
}

function parseStoredSecretKey(value) {
  if (!value) return null
  let values = value

  if (typeof value === 'string') {
    try {
      values = value.trim().startsWith('[') ? JSON.parse(value) : value.split(',').map((part) => Number(part.trim()))
    } catch {
      return null
    }
  }

  if (ArrayBuffer.isView(values)) values = Array.from(values)
  if (!Array.isArray(values) && typeof values === 'object') {
    values = Array.from({ length: 64 }, (_, index) => values[index])
  }
  if (!Array.isArray(values) || values.length !== 64 || values.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return null
  }

  return Uint8Array.from(values)
}

function normalizeStoredAccount(account) {
  if (!account || typeof account !== 'object') return null
  const legacySecretKey = parseStoredSecretKey(account.walletSecretKey || account.secretKey || account.privateKey)
  if (!account.wallet || (!account.walletVault && !legacySecretKey)) return null
  return {
    ...account,
    id: accountIdFor(account),
    authVersion: account.authVersion || (account.passwordHash ? 'password-v1' : account.walletVault ? 'device-v1' : 'legacy-local-secret-v1'),
    email: normalizeEmail(account.email),
    handle: account.handle ? `@${normalizeHandle(account.handle)}` : '',
    walletSecretKey: legacySecretKey || account.walletSecretKey,
    walletVerified: Boolean(account.walletVerified || account.registrationProof?.realMainnet),
    recoveryWalletVerified: Boolean(account.recoveryWalletVerified && account.recoveryWallet && account.recoveryVault && account.recoveryChallenge),
  }
}

function backupLocalStorageValue(key, label = 'backup') {
  try {
    const raw = localStorage.getItem(key)
    if (raw) sessionStorage.setItem(`${key}-${label}-${Date.now()}`, raw)
  } catch {
    // Keep the app usable even if storage backup is blocked.
  }
}

function readLegacyAccount() {
  const stored = localStorage.getItem(ACCOUNT_STORAGE_KEY) || localStorage.getItem(LEGACY_ACCOUNT_STORAGE_KEY)
  return stored ? normalizeStoredAccount(JSON.parse(stored)) : null
}

function loadAccountsStore() {
  try {
    const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed?.accounts)) {
        backupLocalStorageValue(ACCOUNTS_STORAGE_KEY, 'invalid')
        return { accounts: [], activeAccountId: '' }
      }
      const accounts = Array.isArray(parsed?.accounts) ? parsed.accounts.map(normalizeStoredAccount).filter(Boolean) : []
      const activeAccountId = parsed?.activeAccountId || localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY) || accounts[0]?.id || ''
      return { accounts, activeAccountId }
    }

    const legacy = readLegacyAccount()
    if (legacy) return { accounts: [legacy], activeAccountId: legacy.id }
  } catch {
    backupLocalStorageValue(ACCOUNTS_STORAGE_KEY, 'corrupt')
    backupLocalStorageValue(ACCOUNT_STORAGE_KEY, 'corrupt')
    backupLocalStorageValue(LEGACY_ACCOUNT_STORAGE_KEY, 'corrupt')
    return { accounts: [], activeAccountId: '' }
  }

  return { accounts: [], activeAccountId: '' }
}

function saveAccountsStore(store) {
  const accounts = []
  const seen = new Set()
  for (const account of store.accounts || []) {
    const stored = normalizeStoredAccount(toStoredSession(account))
    if (!stored || seen.has(stored.id)) continue
    seen.add(stored.id)
    accounts.push(stored)
  }
  const activeAccountId = store.activeAccountId && accounts.some((account) => account.id === store.activeAccountId) ? store.activeAccountId : accounts[0]?.id || ''
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify({ v: 2, activeAccountId, accounts }))
  if (activeAccountId) localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, activeAccountId)
  else localStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY)

  const active = accounts.find((account) => account.id === activeAccountId)
  if (active) localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(active))
}

function saveAccount(session) {
  const stored = normalizeStoredAccount(toStoredSession(session))
  if (!stored) return
  const current = loadAccountsStore()
  const withoutCurrent = current.accounts.filter((account) => account.id !== stored.id && account.wallet !== stored.wallet)
  saveAccountsStore({ accounts: [stored, ...withoutCurrent], activeAccountId: stored.id })
}

function clearLegacyAccountSecrets() {
  try {
    localStorage.removeItem(LEGACY_ACCOUNT_STORAGE_KEY)
    const stored = localStorage.getItem(ACCOUNT_STORAGE_KEY)
    if (!stored) return
    const parsed = JSON.parse(stored)
    if (parsed?.walletSecretKey || parsed?.secretKey || parsed?.privateKey) {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(toStoredSession(parsed)))
    }
  } catch {
    localStorage.removeItem(LEGACY_ACCOUNT_STORAGE_KEY)
  }
}

function findAccountForLogin({ handle, accountId }) {
  const { accounts, activeAccountId } = loadAccountsStore()
  const cleanHandle = normalizeHandle(handle)
  if (accountId) return accounts.find((account) => account.id === accountId) || null
  const active = accounts.find((account) => account.id === activeAccountId)
  const matches = accounts.filter((account) => {
    const handleMatches = cleanHandle && normalizeHandle(account.handle) === cleanHandle
    return handleMatches
  })
  if (cleanHandle) return matches.find((account) => account.id === activeAccountId) || matches[0] || null
  return active || accounts[0] || null
}

function findAccountsByRecoveryWallet(recoveryWallet) {
  const { accounts } = loadAccountsStore()
  return accounts.filter((account) => account.recoveryWallet === recoveryWallet && account.recoveryWalletVerified && account.recoveryVault && account.recoveryChallenge)
}

function findRecoveryWalletConflict(recoveryWallet, currentAccountId) {
  return findAccountsByRecoveryWallet(recoveryWallet).find((account) => account.id !== currentAccountId) || null
}

function findDuplicateAccount({ handle }) {
  const { accounts } = loadAccountsStore()
  const cleanHandle = normalizeHandle(handle)
  return accounts.find((account) => cleanHandle && normalizeHandle(account.handle) === cleanHandle) || null
}

function clearUnlockedWallet() {
  try {
    sessionStorage.removeItem(UNLOCKED_WALLETS_STORAGE_KEY)
    sessionStorage.removeItem(UNLOCKED_WALLET_STORAGE_KEY)
  } catch {
    // Ignore private browsing/session storage failures.
  }
}

function clearUnlockedAccount(accountId) {
  try {
    const raw = sessionStorage.getItem(UNLOCKED_WALLETS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    delete parsed[accountId]
    sessionStorage.setItem(UNLOCKED_WALLETS_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    clearUnlockedWallet()
  }
}

function saveUnlockedWallet(session) {
  if (!session?.wallet) return
  try {
    const raw = sessionStorage.getItem(UNLOCKED_WALLETS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const id = accountIdFor(session)
    parsed[id] = {
      wallet: session.wallet,
      unlockedAt: new Date().toISOString(),
    }
    sessionStorage.setItem(UNLOCKED_WALLETS_STORAGE_KEY, JSON.stringify(parsed))
    sessionStorage.removeItem(UNLOCKED_WALLET_STORAGE_KEY)
  } catch {
    // The app can still work after a fresh login if session storage is blocked.
  }
}

function markAuthenticated(session) {
  saveAccount(session)
  localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, accountIdFor(session))
  localStorage.setItem(AUTH_STORAGE_KEY, 'true')
  saveUnlockedWallet(session)
}

function loadUnlockedWallet(saved) {
  if (!saved) return null
  try {
    sessionStorage.removeItem(UNLOCKED_WALLET_STORAGE_KEY)
    const raw = sessionStorage.getItem(UNLOCKED_WALLETS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const marker = parsed[accountIdFor(saved)]
    if (marker?.wallet && marker.wallet !== saved.wallet) clearUnlockedAccount(accountIdFor(saved))
  } catch {
    clearUnlockedWallet()
  }
  return toStoredSession(saved)
}

function publicAuthor(author) {
  const {
    passwordHash,
    walletSecretKey,
    walletVault,
    recoveryVault,
    recoveryChallenge,
    recoveryWallet,
    recoveryWalletVerified,
    recoveryWalletLinkedAt,
    ...safeAuthor
  } = author
  return safeAuthor
}

function sanitizePost(post) {
  return { ...post, author: publicAuthor(post.author || {}) }
}

function formatSol(lamports) {
  const value = Number(lamports || 0) / 1_000_000_000
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
}

function safeErrorMessage(error) {
  const message = error?.message || String(error || 'Something went wrong.')
  if (message.includes('Failed to fetch')) return 'Elno signer is not reachable. Start the local signer, then try again.'
  if (message.includes('403') || message.includes('Access forbidden')) return 'RPC access was blocked. The signer must use the configured Helius RPC.'
  if (message.includes('blockhash not found')) return 'The transaction expired before it was sent. Try again.'
  return message
}

function getBrowserSolanaProvider() {
  const provider = window.solana || window.phantom?.solana
  if (!provider?.connect || !provider?.signMessage) {
    throw new Error('Open this app in a Solana wallet browser or install a wallet that supports message signing.')
  }
  return provider
}

async function connectBrowserSolanaWallet() {
  const provider = getBrowserSolanaProvider()
  const result = await provider.connect({ onlyIfTrusted: false })
  const publicKey = result?.publicKey || provider.publicKey
  if (!publicKey?.toBase58) throw new Error('Recovery wallet did not return a public key.')
  return { provider, publicKey: publicKey.toBase58() }
}

function normalizeWalletSignature(result) {
  const signature = result?.signature || result
  if (signature instanceof Uint8Array) return signature
  if (Array.isArray(signature)) return Uint8Array.from(signature)
  throw new Error('Recovery wallet did not return a usable signature.')
}

function recoveryWalletMessage(account, challenge) {
  return enc.encode(
    [
      'osocial-recovery-login:v1',
      `accountWallet:${account.wallet}`,
      `handle:${account.handle}`,
      `challenge:${challenge}`,
    ].join('\n'),
  )
}

async function signRecoveryWalletMessage(provider, account, challenge) {
  const message = recoveryWalletMessage(account, challenge)
  const signature = normalizeWalletSignature(await provider.signMessage(message, 'utf8'))
  return { message, signature }
}

async function sha256Hex(input) {
  const buffer =
    input instanceof ArrayBuffer
      ? input
      : ArrayBuffer.isView(input)
        ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
        : enc.encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

let postsStorageReadFailed = false

function loadPosts() {
  try {
    const stored = localStorage.getItem(POSTS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed.map(sanitizePost)
      postsStorageReadFailed = true
      backupLocalStorageValue(POSTS_STORAGE_KEY, 'invalid')
      return seedPosts
    }
  } catch {
    postsStorageReadFailed = true
    backupLocalStorageValue(POSTS_STORAGE_KEY, 'corrupt')
    return seedPosts
  }
  return seedPosts
}

function loadAccount() {
  try {
    const { accounts, activeAccountId } = loadAccountsStore()
    return accounts.find((account) => account.id === activeAccountId) || accounts[0] || null
  } catch {
    return null
  }
}

function loadSession() {
  try {
    const saved = loadAccount()
    if (!saved || localStorage.getItem(AUTH_STORAGE_KEY) !== 'true') return null
    if (!isDeviceVault(saved.walletVault)) return null
    return loadUnlockedWallet(saved)
  } catch {
    return null
  }
}

function displayNameFromHandle(handle) {
  const clean = normalizeHandle(handle)
  if (!clean) return 'Founder'
  return clean
    .split(/[._]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function unlockStoredAccount(saved, { legacyPassword = '' } = {}) {
  const legacySecretKey = parseStoredSecretKey(saved.walletSecretKey || saved.secretKey || saved.privateKey)
  if (legacySecretKey) {
    const walletAddress = publicKeyFromSecret(legacySecretKey)
    if (walletAddress !== saved.wallet) throw new Error('Stored wallet key does not match this account.')
    const migrated = {
      ...saved,
      authVersion: 'device-v1',
      walletVault: await encryptDeviceSecretKey(legacySecretKey),
      walletSecretKey: legacySecretKey,
    }
    saveAccount(migrated)
    clearLegacyAccountSecrets()
    saveUnlockedWallet(migrated)
    return migrated
  }

  const cached = loadUnlockedWallet(saved)
  if (cached?.walletSecretKey) return cached

  if (!saved?.walletVault) throw new Error('No wallet vault found for this account.')
  if (isLegacyPasswordVault(saved.walletVault)) {
    if (!legacyPassword) {
      throw new Error('This older saved account needs its old password once. Enter it to migrate the wallet into the device vault.')
    }
    const walletSecretKey = await decryptSecretKey(saved.walletVault, legacyPassword)
    const walletAddress = publicKeyFromSecret(walletSecretKey)
    if (walletAddress !== saved.wallet) throw new Error('Password vault does not match this account wallet.')
    const migrated = {
      ...saved,
      authVersion: 'device-v1',
      walletVault: await encryptDeviceSecretKey(walletSecretKey),
      walletSecretKey,
    }
    saveAccount(migrated)
    clearLegacyAccountSecrets()
    saveUnlockedWallet(migrated)
    return migrated
  }
  if (!isDeviceVault(saved.walletVault)) {
    throw new Error('This older account uses the old password vault. Use its linked recovery wallet, or keep that old session open until we migrate it.')
  }

  try {
    const walletSecretKey = await decryptDeviceSecretKey(saved.walletVault)
    const walletAddress = publicKeyFromSecret(walletSecretKey)
    if (walletAddress !== saved.wallet) throw new Error('Device vault does not match this account wallet.')
    return { ...saved, walletSecretKey }
  } catch (error) {
    throw new Error(`Device vault could not unlock this account. Use the linked recovery wallet or create a new app wallet. ${safeErrorMessage(error)}`)
  }
}

async function buildSession({ mode, name, email, handle, walletMode, importedSecret }) {
  const cleanName = name.trim() || displayNameFromHandle(handle) || (mode === 'signup' ? 'New Founder' : 'Returning Founder')
  const cleanEmail = normalizeEmail(email)
  const cleanHandle = normalizeHandle(handle) || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'founder'
  const fingerprint = (await sha256Hex(`${cleanName}:${cleanEmail}:${cleanHandle}:${Date.now()}`)).slice(0, 36)
  const keypair = walletMode === 'import' ? Keypair.fromSecretKey(parseSecretKeyImport(importedSecret)) : Keypair.generate()
  const walletSecretKey = keypair.secretKey
  const walletAddress = keypair.publicKey.toBase58()
  const walletVault = await encryptDeviceSecretKey(walletSecretKey)
  const palette = ['#a36bff', '#e0479e', '#7c5cff', '#ffb648']

  return {
    id: walletAddress,
    name: cleanName,
    email: cleanEmail,
    handle: `@${cleanHandle}`,
    wallet: walletAddress,
    accent: palette[fingerprint.charCodeAt(0) % palette.length],
    authVersion: 'device-v1',
    walletVault,
    walletKind: walletMode === 'import' ? 'imported' : 'generated',
    walletSecretKey,
    walletVerified: true,
    walletVerifiedAt: new Date().toISOString(),
    fundingStatus: 'unfunded',
    registered: false,
    joinedAt: new Date().toISOString(),
  }
}

async function makeRegistrationProof(session) {
  let profilePda = ''
  let usernameIndex = ''
  const username = normalizeHandle(session.handle)

  try {
    const [pda] = PublicKey.findProgramAddressSync(
      [enc.encode('profile'), new PublicKey(session.wallet).toBuffer()],
      new PublicKey(REGISTRY_PROGRAM_ID),
    )
    profilePda = pda.toBase58()
    const [handlePda] = PublicKey.findProgramAddressSync(
      [enc.encode('handle'), enc.encode(username)],
      new PublicKey(REGISTRY_PROGRAM_ID),
    )
    usernameIndex = handlePda.toBase58()
  } catch {
    profilePda = `local-pda-${(await sha256Hex(`${REGISTRY_PROGRAM_ID}:${session.wallet}`)).slice(0, 32)}`
    usernameIndex = `local-handle-${(await sha256Hex(`${REGISTRY_PROGRAM_ID}:${username}`)).slice(0, 32)}`
  }

  return {
    programId: REGISTRY_PROGRAM_ID,
    feePayer: session.wallet,
    platformCoSigner: PLATFORM_AUTHORITY,
    treasury: REGISTRY_TREASURY,
    username: `@${username}`,
    usernameIndex,
    profilePda,
    fee: REGISTRATION_FEE_LABEL,
    instruction: 'register_profile',
    event: 'ProfileRegistered',
    events: ['ProfileRegistered'],
    signature: `local-reg-${Date.now().toString(36)}`,
    usernameTx: '',
    signedAt: new Date().toISOString(),
  }
}

async function registrationProofFromResult(session, result = {}) {
  const base = await makeRegistrationProof(session)
  return {
    ...base,
    realMainnet: true,
    signature: result.signature,
    usernameTx: result.usernameTx || result.signature,
    username: result.username || base.username,
    usernameIndex: result.usernameIndex || result.handleClaim || base.usernameIndex,
    profilePda: result.profile || base.profilePda,
    handleClaim: result.handleClaim || result.usernameIndex || base.usernameIndex,
    instruction: result.instruction || base.instruction,
    event: result.event || base.event,
    events: result.events || base.events,
    storageMode: result.storageMode || 'profile+handle_claim',
    expectedBaseFeeLamports: result.expectedBaseFeeLamports || '',
    registrationFeeLamports: result.registrationFeeLamports || '',
    registrationRentLamports: result.registrationRentLamports || '',
    requiredRegistrationBalanceLamports: result.requiredRegistrationBalanceLamports || result.requiredUserBalanceLamports || '',
    userBalanceLamports: result.userBalanceLamports || '',
    treasury: result.treasury || base.treasury,
    authority: result.authority || base.platformCoSigner,
    signedAt: new Date().toISOString(),
  }
}

function Avatar({ author }) {
  const initials = author.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)

  return (
    <div className="avatar" style={{ '--avatar-accent': author.accent }}>
      {initials}
    </div>
  )
}

function AuthIllustration() {
  // On-chain social temasi: telefon/feed karti + yuzen post baloncuklari + ag dugumleri + cuzdan/jeton, mor-pembe.
  return (
    <div className="auth-illustration" aria-hidden="true">
      <svg viewBox="0 0 560 520" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
        <defs>
          <linearGradient id="il-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a36bff" />
            <stop offset="1" stopColor="#e0479e" />
          </linearGradient>
          <linearGradient id="il-grad2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c5cff" />
            <stop offset="1" stopColor="#a36bff" />
          </linearGradient>
          <linearGradient id="il-card" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#f3effd" />
          </linearGradient>
          <filter id="il-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="18" stdDeviation="26" floodColor="#6d3bd1" floodOpacity="0.28" />
          </filter>
        </defs>

        {/* arka blob */}
        <circle cx="300" cy="250" r="210" fill="url(#il-grad)" opacity="0.16" />
        <circle cx="430" cy="120" r="70" fill="url(#il-grad)" opacity="0.22" />
        <circle cx="120" cy="380" r="46" fill="url(#il-grad2)" opacity="0.20" />

        {/* ag dugumleri / baglanti cizgileri */}
        <g stroke="url(#il-grad)" strokeWidth="2.5" opacity="0.5">
          <line x1="120" y1="150" x2="220" y2="220" />
          <line x1="430" y1="330" x2="350" y2="270" />
          <line x1="150" y1="360" x2="230" y2="300" />
        </g>
        <g fill="#e0479e">
          <circle cx="120" cy="150" r="9" />
          <circle cx="430" cy="330" r="11" />
          <circle cx="150" cy="360" r="7" />
        </g>

        {/* ana feed karti (telefon) */}
        <g filter="url(#il-shadow)">
          <rect x="196" y="92" width="200" height="336" rx="30" fill="url(#il-card)" />
          <rect x="196" y="92" width="200" height="76" rx="30" fill="url(#il-grad)" />
          <rect x="196" y="138" width="200" height="30" fill="url(#il-grad)" opacity="0.001" />
          {/* avatar + isim */}
          <circle cx="232" cy="130" r="18" fill="#ffffff" />
          <circle cx="232" cy="130" r="14" fill="url(#il-grad2)" />
          <rect x="258" y="120" width="86" height="9" rx="4.5" fill="#ffffff" opacity="0.95" />
          <rect x="258" y="136" width="56" height="8" rx="4" fill="#ffffff" opacity="0.7" />
          {/* post satirlari */}
          <rect x="222" y="196" width="148" height="9" rx="4.5" fill="#d9cffb" />
          <rect x="222" y="216" width="118" height="9" rx="4.5" fill="#e7defb" />
          <rect x="222" y="246" width="148" height="58" rx="14" fill="#f0e9fd" />
          <circle cx="246" cy="275" r="13" fill="url(#il-grad)" opacity="0.85" />
          <rect x="268" y="262" width="86" height="8" rx="4" fill="#cdbdf5" />
          <rect x="268" y="280" width="60" height="8" rx="4" fill="#ddd0f7" />
          {/* reaksiyon satiri */}
          <g transform="translate(222 326)">
            <path d="M10 3c-2.2-3-7-2-7 2 0 3 4 5.5 7 8 3-2.5 7-5 7-8 0-4-4.8-5-7-2z" fill="#e0479e" />
            <rect x="24" y="3" width="22" height="8" rx="4" fill="#e3d8fa" />
            <circle cx="92" cy="7" r="7" fill="none" stroke="#bda6f0" strokeWidth="2.5" />
            <rect x="108" y="3" width="22" height="8" rx="4" fill="#e3d8fa" />
          </g>
          <rect x="222" y="362" width="148" height="40" rx="12" fill="url(#il-grad)" />
          <rect x="262" y="378" width="68" height="8" rx="4" fill="#ffffff" opacity="0.9" />
        </g>

        {/* yuzen post baloncugu */}
        <g filter="url(#il-shadow)">
          <rect x="372" y="190" width="150" height="74" rx="18" fill="#ffffff" />
          <circle cx="398" cy="218" r="14" fill="url(#il-grad)" />
          <rect x="420" y="208" width="80" height="8" rx="4" fill="#d9cffb" />
          <rect x="420" y="224" width="56" height="8" rx="4" fill="#e7defb" />
          <rect x="398" y="242" width="100" height="8" rx="4" fill="#efe9fb" />
        </g>

        {/* cuzdan / jeton */}
        <g filter="url(#il-shadow)" transform="translate(78 232)">
          <rect x="0" y="0" width="120" height="84" rx="18" fill="url(#il-grad2)" />
          <rect x="0" y="0" width="120" height="84" rx="18" fill="#ffffff" opacity="0.08" />
          <circle cx="92" cy="42" r="16" fill="#ffffff" opacity="0.95" />
          <circle cx="92" cy="42" r="9" fill="url(#il-grad)" />
          <rect x="18" y="22" width="52" height="8" rx="4" fill="#ffffff" opacity="0.9" />
          <rect x="18" y="40" width="40" height="7" rx="3.5" fill="#ffffff" opacity="0.6" />
        </g>

        {/* parlayan orb (top-right) */}
        <circle cx="448" cy="120" r="26" fill="url(#il-grad)" />
        <circle cx="448" cy="120" r="26" fill="#ffffff" opacity="0.12" />
        <g stroke="#e0479e" strokeWidth="3" strokeLinecap="round" opacity="0.8">
          <line x1="448" y1="78" x2="448" y2="66" />
          <line x1="484" y1="100" x2="494" y2="92" />
          <line x1="412" y1="100" x2="402" y2="92" />
        </g>
      </svg>
    </div>
  )
}

function ElnoMark() {
  // Elno logosu (kullanicinin sectigi "e" monogram app-icon).
  return <img className="brand-logo" src="/elno-logo.png" alt="Elno" />
}

function AuthGate({ onEnter }) {
  const savedAccount = loadAccount()
  const savedAccounts = loadAccountsStore().accounts
  const [mode, setMode] = useState(() => (savedAccount ? 'login' : 'signup'))
  const [handle, setHandle] = useState(() => savedAccount?.handle?.replace(/^@/, '') || 'founder')
  const [selectedAccountId, setSelectedAccountId] = useState(() => savedAccount?.id || '')
  const [legacyPassword, setLegacyPassword] = useState('')
  const [keyLogin, setKeyLogin] = useState('')
  const [status, setStatus] = useState(() => (savedAccount ? 'Account found on this device. Continue with your username.' : ''))
  const [authBusy, setAuthBusy] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [pendingSession, setPendingSession] = useState(null)
  const [backupSession, setBackupSession] = useState(null)
  const [keyRevealed, setKeyRevealed] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
  const [fundingConfirmed, setFundingConfirmed] = useState(false)
  const [balanceLamports, setBalanceLamports] = useState(null)
  const [minBalanceLamports, setMinBalanceLamports] = useState(DEFAULT_MIN_USER_BALANCE_LAMPORTS)
  const [minBalanceLabel, setMinBalanceLabel] = useState(REGISTRATION_FEE_LABEL)
  const [checkingBalance, setCheckingBalance] = useState(false)
  const activeSavedAccount =
    savedAccounts.find((account) => account.id === selectedAccountId) ||
    savedAccounts.find((account) => normalizeHandle(account.handle) === normalizeHandle(handle))
  const hasSavedAccounts = savedAccounts.length > 0
  const activeNeedsLegacyPassword =
    mode === 'login' &&
    activeSavedAccount &&
    isLegacyPasswordVault(activeSavedAccount.walletVault) &&
    !parseStoredSecretKey(activeSavedAccount.walletSecretKey || activeSavedAccount.secretKey || activeSavedAccount.privateKey)

  const showExistingAccountLogin = (account = loadAccount(), message = 'That username already has an account here. Continue so the wallet is not replaced.') => {
    if (!account) return false
    setMode('login')
    setHandle(account.handle?.replace(/^@/, '') || handle)
    setStatus(message)
    return true
  }

  const ensureHandleAvailable = async (value) => {
    const result = await checkUsernameAvailability(normalizeHandle(value))
    if (!result.available) throw new Error(`@${result.handle} is already claimed on-chain. Choose another username.`)
    return result
  }

  const switchToSignup = () => {
    if (authBusy || isActivating) return
    setSelectedAccountId('')
    setLegacyPassword('')
    setMode('signup')
    setStatus('Choose a username. Elno will create the app wallet on this device.')
  }

  const switchToLogin = () => {
    if (authBusy || isActivating) return
    const account = loadAccount()
    if (account) {
      setHandle(account.handle?.replace(/^@/, '') || handle)
      setSelectedAccountId(account.id)
    }
    setLegacyPassword('')
    setMode('login')
    setStatus(account ? 'Account found on this device. Continue with your username.' : '')
  }

  const selectSavedAccount = (account) => {
    if (authBusy || isActivating) return
    setMode('login')
    setHandle(account.handle?.replace(/^@/, '') || handle)
    setSelectedAccountId(account.id)
    setLegacyPassword('')
    setStatus(`${account.handle} selected. Continue on this device or use the linked recovery wallet.`)
  }

  const loginWithRecoveryWallet = async () => {
    if (recovering) return
    setRecovering(true)
    setStatus('Waiting for recovery wallet...')
    try {
      const { provider, publicKey } = await connectBrowserSolanaWallet()
      const matches = findAccountsByRecoveryWallet(publicKey)
      const saved =
        matches.find((account) => account.id === selectedAccountId) ||
        matches.find((account) => normalizeHandle(account.handle) === normalizeHandle(handle)) ||
        (matches.length === 1 ? matches[0] : null)
      if (matches.length > 1 && !saved) throw new Error('This recovery wallet is linked to multiple local accounts. Select the saved account first.')
      if (!saved) throw new Error('No account on this device is linked to that recovery wallet.')
      const challenge = saved.recoveryChallenge
      if (!challenge || !saved.recoveryVault) throw new Error('This account does not have a complete recovery wallet setup.')
      const { message, signature } = await signRecoveryWalletMessage(provider, saved, challenge)
      const walletSecretKey = await decryptRecoverySecretKey(saved.recoveryVault, signature)
      if (publicKeyFromSecret(walletSecretKey) !== saved.wallet) throw new Error('Recovery vault does not match the account wallet.')
      const unlocked = { ...saved, walletSecretKey }
      if (!unlocked.registered) {
        setPendingSession(unlocked)
        setStatus('Recovery opened this draft wallet. Fund it, then register the username on-chain.')
        return
      }
      markAuthenticated(unlocked)
      onEnter(unlocked)
    } catch (error) {
      setStatus(safeErrorMessage(error))
    } finally {
      setRecovering(false)
    }
  }

  // Kayitta gosterdigimiz private key ile giris (her cihazdan calisir — key = hesap).
  const loginWithKey = async () => {
    if (!keyLogin.trim() || authBusy || isActivating) return
    setAuthBusy(true)
    setStatus('Opening your account from the private key...')
    try {
      const secret = parseSecretKeyImport(keyLogin.trim())
      const wallet = publicKeyFromSecret(secret)
      const match = savedAccounts.find((account) => account.wallet === wallet)
      let session
      if (match) {
        // bu cihazda kayitli: hesap meta'sini al, key'i ac
        session = { ...match, walletSecretKey: Array.from(secret), walletVerified: true }
      } else {
        // baska cihaz: zincirden profili cek (gercek handle icin), key'den session kur
        let onchain = null
        try {
          onchain = await getProfile(wallet)
        } catch {
          onchain = null // signer ulasilamaz: iyimser devam
        }
        if (onchain && onchain.exists === false) {
          setStatus('No Elno account is registered for this key. Sign up first, or check the key.')
          setAuthBusy(false)
          return
        }
        const onchainHandle = onchain?.handle || 'founder'
        const built = await buildSession({ mode: 'login', name: '', email: '', handle: onchainHandle, walletMode: 'import', importedSecret: keyLogin.trim() })
        session = { ...built, walletSecretKey: Array.from(secret), registered: true, walletVerified: true }
      }
      setKeyLogin('')
      markAuthenticated(session)
      onEnter(session)
    } catch (error) {
      setStatus(safeErrorMessage(error) || 'That private key is not valid. Paste the key you saved at sign-up.')
    } finally {
      setAuthBusy(false)
    }
  }

  const refreshBalance = async (session = pendingSession) => {
    if (!session) return false
    setCheckingBalance(true)
    try {
      const health = await getSignerHealth()
      const nextMin = Number(health.requiredRegistrationBalanceLamports || health.minUserBalanceLamports || DEFAULT_MIN_USER_BALANCE_LAMPORTS)
      const nextLabel = health.requiredRegistrationBalanceLabel
        ? `${health.registrationFeeLabel || 'Username free now'} · rent + network fee${health.requiredRegistrationBalanceUsd ? ` ≈ ${health.requiredRegistrationBalanceUsd}` : ''}`
        : health.minUserBalanceLabel || REGISTRATION_FEE_LABEL
      const lamports = await getSolBalanceLamports(session.wallet)
      const funded = lamports >= nextMin
      const updated = { ...session, fundingStatus: funded ? 'funded' : 'unfunded' }
      setMinBalanceLamports(nextMin)
      setMinBalanceLabel(nextLabel)
      setBalanceLamports(lamports)
      setFundingConfirmed(funded)
      setPendingSession(updated)
      saveAccount(updated)
      setStatus(
        funded
          ? 'Wallet balance is ready. Register now to claim this username on-chain.'
          : `Wallet has ${formatSol(lamports)}. Needed to open account: ${formatSol(nextMin)}.`,
      )
      return funded
    } catch (error) {
      setStatus(safeErrorMessage(error))
      return false
    } finally {
      setCheckingBalance(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (authBusy || isActivating) return
    setAuthBusy(true)
    try {
      if (mode === 'signup') {
        const duplicate = findDuplicateAccount({ handle })
        if (duplicate) {
          showExistingAccountLogin(duplicate, 'That username already has a draft or account here. Continue so the wallet is not replaced.')
          return
        }

        const inputError = validateSignupInput({ name: displayNameFromHandle(handle), handle })
        if (inputError) {
          setStatus(inputError)
          return
        }
        setStatus('Checking username on-chain...')
        await ensureHandleAvailable(handle)
      }

      setStatus(mode === 'signup' ? 'Creating device wallet...' : 'Opening device vault...')

      if (mode === 'login') {
        const saved = findAccountForLogin({ handle, accountId: selectedAccountId })
        if (!saved) {
          setStatus('No matching account on this device. Pick a saved handle or use the linked recovery wallet.')
          return
        }
        const unlocked = await unlockStoredAccount(saved, { legacyPassword })
        if (!unlocked.registered) {
          setPendingSession(unlocked)
          setStatus('This username is still a draft. Fund the app wallet, then register to open the account.')
          return
        }
        setLegacyPassword('')
        markAuthenticated(unlocked)
        onEnter(unlocked)
        return
      }

      const session = await buildSession({ mode, name: displayNameFromHandle(handle), email: '', handle, walletMode: 'create', importedSecret: '' })
      const inputError = validateSignupInput({ name: session.name, handle, wallet: session.wallet })
      if (inputError) {
        setStatus(inputError)
        return
      }
      const duplicate = findDuplicateAccount({ handle })
      if (duplicate) {
        showExistingAccountLogin(duplicate, 'That username already has a draft or account here. Continue so the wallet is not replaced.')
        return
      }
      saveAccount(session)
      setPendingSession(session)
      setFundingConfirmed(false)
      setBalanceLamports(null)
      setStatus('App wallet created. Add the minimum balance, then register to open this account.')
    } catch (error) {
      setStatus(safeErrorMessage(error))
    } finally {
      setAuthBusy(false)
    }
  }

  const signRegistryContract = async () => {
    if (!pendingSession || isActivating) return
    setIsActivating(true)
    try {
      await ensureHandleAvailable(pendingSession.handle)
      const hasBalance = await refreshBalance(pendingSession)
      if (!hasBalance) return
      if (!pendingSession.walletSecretKey) throw new Error('Local wallet is locked. Sign in again with your username.')
      setStatus('Requesting platform co-signature and signing locally...')
      const walletProvider = createLocalWallet(pendingSession.walletSecretKey)
      const connected = walletProvider.publicKey.toBase58()
      if (connected !== pendingSession.wallet) throw new Error(`Local wallet ${connected} does not match account wallet ${pendingSession.wallet}.`)
      const result = await registerProfileOnMainnet({
        wallet: walletProvider,
        userPublicKey: pendingSession.wallet,
        handle: pendingSession.handle.replace(/^@/, ''),
        displayName: pendingSession.name,
      })
      const registrationProof = await registrationProofFromResult(pendingSession, result)
      const registered = {
        ...pendingSession,
        fundingStatus: 'funded',
        registered: true,
        registrationProof,
      }
      saveAccount(registered)
      markAuthenticated(registered)
      // Feed'e gecmeden once: kullaniciya giris anahtarini sakla dedirt.
      setKeyRevealed(false)
      setKeySaved(false)
      setBackupSession(registered)
      setStatus('')
    } catch (error) {
      setStatus(safeErrorMessage(error))
    } finally {
      setIsActivating(false)
    }
  }

  const connectPendingRecoveryWallet = async () => {
    if (!pendingSession || recovering || isActivating) return
    setRecovering(true)
    setStatus('Waiting for recovery wallet message signature...')
    try {
      const updated = await linkRecoveryWallet(pendingSession)
      setPendingSession(updated)
      setStatus(`Recovery wallet linked: ${updated.recoveryWallet.slice(0, 6)}...${updated.recoveryWallet.slice(-4)}. Now fund the app wallet to open the account.`)
    } catch (error) {
      setStatus(safeErrorMessage(error))
    } finally {
      setRecovering(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-hero">
        <div className="brand-block auth-brand">
          <div className="brand-mark">
            <ElnoMark />
          </div>
          <div>
            <span>On-chain social</span>
            <strong>Elno</strong>
          </div>
        </div>

        <div className="auth-copy">
          <span>On-chain social · Solana mainnet</span>
          <h1>Own your posts. Prove every word.</h1>
          <p>Elno is a social feed where each post is a Solana transaction — public, verifiable, and impossible for any platform to edit, hide, or delete.</p>
        </div>

        <div className="auth-ledger-strip" aria-hidden="true">
          <div>
            <span>Mainnet program</span>
            <strong>{shortAddress(REGISTRY_PROGRAM_ID, 7, 5)}</strong>
          </div>
          <div>
            <span>Post path</span>
            <strong>1 tx event</strong>
          </div>
          <div>
            <span>Reader API</span>
            <strong>RPC indexers</strong>
          </div>
        </div>

        <AuthIllustration />

        <div className="auth-trust-chips" aria-hidden="true">
          <span><ShieldCheck aria-hidden="true" /> Verify on any explorer</span>
          <span><Database aria-hidden="true" /> You hold the keys</span>
          <span><Zap aria-hidden="true" /> Cents to post</span>
        </div>
      </section>

      <section className="auth-panel">
        {backupSession ? (
          <div className="funding-panel backup-panel">
            <div className="auth-panel-head">
              <div className="auth-kicker"><span>Account is live</span></div>
              <h2>Save your key. This is the only time.</h2>
            </div>

            <div className="key-warning">
              <KeyRound aria-hidden="true" />
              <div>
                <strong>This private key controls @{backupSession.handle.replace(/^@/, '')} completely.</strong>
                <span>
                  Store it in a password manager or write it down offline before you continue. Elno never sees
                  it and can never recover it; lose it and the account is gone for good.
                </span>
              </div>
            </div>

            <div className="key-reveal">
              <span>Private key — import this into Phantom / Solflare to log in anywhere</span>
              <code className={keyRevealed ? '' : 'masked'}>
                {keyRevealed
                  ? bs58.encode(Uint8Array.from(backupSession.walletSecretKey))
                  : '•'.repeat(44)}
              </code>
              <div className="wallet-actions">
                <IconButton icon={keyRevealed ? Lock : Eye} onClick={() => setKeyRevealed((v) => !v)}>
                  {keyRevealed ? 'Hide' : 'Reveal key'}
                </IconButton>
                <CopyButton value={bs58.encode(Uint8Array.from(backupSession.walletSecretKey))}>Copy key</CopyButton>
              </div>
            </div>

            <label className="key-saved-check">
              <input type="checkbox" checked={keySaved} onChange={(event) => setKeySaved(event.target.checked)} />
              <span>I saved my login key somewhere safe.</span>
            </label>

            <button className="auth-submit" type="button" disabled={!keySaved} onClick={() => onEnter(backupSession)}>
              <UserRound aria-hidden="true" />
              <span>I saved it — enter my feed</span>
            </button>
            <p>Copy this key now and store it safely — it’s shown here right after activation so you don’t lose access.</p>
          </div>
        ) : pendingSession ? (
          <div className="funding-panel">
            <div className="auth-panel-head">
              <span>Last step</span>
              <h2>Fund @{pendingSession.handle.replace(/^@/, '')} to go live</h2>
            </div>

            <div className="wallet-notice">
              <ShieldCheck aria-hidden="true" />
              <span>
                This wallet exists only for Elno on this device — treat it like a hot wallet and keep just a few
                cents of SOL here, <strong>never your savings</strong>.
              </span>
            </div>

            <div className="generated-wallet">
              <span>{pendingSession.walletKind === 'imported' ? 'Imported app wallet' : 'Generated app wallet'}</span>
              <code>{pendingSession.wallet}</code>
              <small>Send SOL on Solana Mainnet only. Username is free right now — this just covers account rent and the network fee.</small>
              <div className="wallet-actions">
                <CopyButton value={pendingSession.wallet}>Copy address</CopyButton>
                {pendingSession.recoveryWalletVerified ? (
                  <div className="recovery-linked-pill">
                    <ShieldCheck aria-hidden="true" />
                    <span>Recovery added</span>
                  </div>
                ) : (
                  <IconButton icon={Wallet} onClick={connectPendingRecoveryWallet} disabled={recovering || isActivating}>
                    {recovering ? 'Adding recovery' : 'Add recovery wallet'}
                  </IconButton>
                )}
              </div>
            </div>

            <div className={`balance-card ${fundingConfirmed ? 'ready' : ''}`}>
              <span>Activation balance</span>
              <strong>{balanceLamports === null ? 'Not checked' : formatSol(balanceLamports)}</strong>
              <small>Needed: {formatSol(minBalanceLamports)} · {minBalanceLabel}</small>
            </div>

            <div className="funding-steps">
              <div className="done">
                <strong>1</strong>
                <div className="step-text">
                  <span>Copy your wallet address</span>
                  <small>Elno created a fresh Solana wallet for this account — tap copy to grab its address from the card above.</small>
                </div>
              </div>
              <div className={fundingConfirmed ? 'done' : ''}>
                <strong>2</strong>
                <div className="step-text">
                  <span>Send a little SOL (mainnet)</span>
                  <small>From any exchange or wallet, send about 0.004 SOL on Solana Mainnet to that address — enough to cover account rent and the network fee. (Check the exact amount above.)</small>
                </div>
              </div>
              <div className={fundingConfirmed ? 'done' : ''}>
                <strong>3</strong>
                <div className="step-text">
                  <span>Activate on-chain</span>
                  <small>Once the SOL lands, hit activate — Elno registers your handle through the mainnet program and your account goes live.</small>
                </div>
              </div>
            </div>

            <div className="contract-preview">
              <span>Technical proof</span>
              <code>register_profile emits ProfileRegistered</code>
              <span>Fee payer</span>
              <code>{pendingSession.wallet}</code>
              <span>Platform co-signer</span>
              <code>{PLATFORM_AUTHORITY}</code>
              <span>Program</span>
              <code>{REGISTRY_PROGRAM_ID}</code>
              <span>Treasury</span>
              <code>{REGISTRY_TREASURY}</code>
            </div>

            <button className="auth-submit secondary" type="button" onClick={() => refreshBalance()} disabled={checkingBalance || isActivating}>
              <Wallet aria-hidden="true" />
              <span>{checkingBalance ? 'Checking balance' : 'Check balance'}</span>
            </button>
            <button className="auth-submit" type="button" disabled={!fundingConfirmed || checkingBalance || isActivating} onClick={signRegistryContract}>
              <KeyRound aria-hidden="true" />
              <span>{isActivating ? 'Activating' : `Activate @${pendingSession.handle.replace(/^@/, '')}`}</span>
            </button>
            <p>{status || 'Elno creates the profile through the published mainnet program. Every future post can use the low-cost post path.'}</p>
          </div>
        ) : (
          <>
            <div className="auth-panel-head">
              <div className="auth-kicker">
                <span>{mode === 'signup' ? 'New account' : 'Welcome back'}</span>
              </div>
              <h2>{mode === 'signup' ? 'Claim your handle on-chain' : 'Sign in with your key'}</h2>
            </div>

            {mode === 'signup' && (
              <div className="auth-explainer auth-path">
                <div className="active">
                  <strong>1</strong>
                  <span>Pick username</span>
                </div>
                <div>
                  <strong>2</strong>
                  <span>Add funds</span>
                </div>
                <div className="active">
                  <strong>3</strong>
                  <span>Save your key</span>
                </div>
              </div>
            )}

            <div className="auth-switch" aria-label="Authentication mode">
              <button className={mode === 'signup' ? 'active' : ''} type="button" disabled={authBusy || isActivating} onClick={switchToSignup}>
                Sign up
              </button>
              <button className={mode === 'login' ? 'active' : ''} type="button" disabled={authBusy || isActivating} onClick={switchToLogin}>
                Log in
              </button>
            </div>

            <form className="auth-form" onSubmit={mode === 'login' ? (event) => { event.preventDefault(); loginWithKey() } : submit}>
              {mode === 'signup' ? (
                <label className="handle-field">
                  <span>Username</span>
                  <div className="handle-input">
                    <strong>@</strong>
                    <input
                      value={handle}
                      autoComplete="username"
                      maxLength={MAX_USERNAME_CHARS}
                      pattern="[a-z0-9._]{3,30}"
                      onChange={(event) => setHandle(normalizeHandle(event.target.value))}
                    />
                  </div>
                  <small>3–30 characters: a–z, 0–9, dot, underscore. Once claimed, it’s your @ across Elno — permanent and yours.</small>
                </label>
              ) : (
                <label className="handle-field">
                  <span>Private key</span>
                  <div className="handle-input">
                    <KeyRound aria-hidden="true" />
                    <input
                      value={keyLogin}
                      type="password"
                      autoComplete="off"
                      placeholder="Paste the private key you saved at sign-up"
                      onChange={(event) => setKeyLogin(event.target.value)}
                    />
                  </div>
                  <small>Paste the key you saved at sign-up. It’s your login — it works from any device and never leaves your browser.</small>
                </label>
              )}

              <div className={`auth-state ${status ? 'active' : ''}`} role="status" aria-live="polite">
                <ShieldCheck aria-hidden="true" />
                <p>{status || (mode === 'signup' ? 'No email, no password. Elno generates a device wallet right here in your browser — the private key never leaves this device.' : 'Your key is your account. No email, no password, no recovery desk — just you and the chain.')}</p>
              </div>

              {mode === 'signup' ? (
                <button className="auth-submit" type="submit" disabled={authBusy || isActivating}>
                  <UserRound aria-hidden="true" />
                  <span>{authBusy ? 'Checking' : 'Create account'}</span>
                </button>
              ) : (
                <>
                  <button className="auth-submit" type="button" disabled={!keyLogin.trim() || authBusy || isActivating} onClick={loginWithKey}>
                    <KeyRound aria-hidden="true" />
                    <span>{authBusy ? 'Opening' : 'Unlock my feed'}</span>
                  </button>
                  <button className="auth-submit secondary" type="button" disabled={recovering || authBusy || isActivating} onClick={loginWithRecoveryWallet}>
                    <Wallet aria-hidden="true" />
                    <span>{recovering ? 'Checking wallet' : 'Use recovery wallet'}</span>
                  </button>
                </>
              )}
            </form>
          </>
        )}
      </section>
    </main>
  )
}

function IconButton({ icon: Icon, children, className = '', ...props }) {
  return (
    <button className={`icon-button ${className}`} type="button" {...props}>
      <Icon aria-hidden="true" />
      {children && <span>{children}</span>}
    </button>
  )
}

function CopyButton({ value, children = 'Copy' }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1300)
    } catch {
      setCopied(false)
    }
  }

  return (
    <IconButton icon={copied ? Check : Copy} onClick={copy} disabled={!value}>
      {copied ? 'Copied' : children}
    </IconButton>
  )
}

function MiniBars({ values = [24, 42, 36, 58, 49, 76, 64, 88], tone = 'chain' }) {
  const max = Math.max(...values, 1)
  return (
    <div className={`mini-bars ${tone}`} aria-hidden="true">
      {values.map((value, index) => (
        <span key={`${value}-${index}`} style={{ '--bar': `${Math.max(12, (value / max) * 100)}%` }} />
      ))}
    </div>
  )
}

function RingMeter({ value = 72, label, detail, tone = 'chain' }) {
  const clamped = Math.max(0, Math.min(100, Number(value || 0)))
  return (
    <div className={`ring-meter ${tone}`} style={{ '--meter': `${clamped}%` }}>
      <div>
        <strong>{clamped}</strong>
        <span>%</span>
      </div>
      <p>{label}</p>
      <small>{detail}</small>
    </div>
  )
}

function FlowGraphic({ steps }) {
  return (
    <div className="flow-graphic" aria-hidden="true">
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          <div>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
          {index < steps.length - 1 && <i />}
        </React.Fragment>
      ))}
    </div>
  )
}

function ProofMatrix() {
  return (
    <div className="proof-matrix" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <span key={index} className={index % 5 === 0 || index % 7 === 0 ? 'hot' : ''} />
      ))}
    </div>
  )
}

async function verifyWalletLocally(currentUser) {
  if (!currentUser.walletSecretKey) throw new Error('Local wallet is locked. Sign in again with your username.')
  const walletSecretKey = Uint8Array.from(currentUser.walletSecretKey)
  const walletAddress = publicKeyFromSecret(walletSecretKey)
  if (walletAddress !== currentUser.wallet) throw new Error(`Local wallet ${walletAddress} does not match account wallet ${currentUser.wallet}.`)

  const updated = {
    ...currentUser,
    walletVerified: true,
    walletVerifiedAt: new Date().toISOString(),
  }
  saveAccount(updated)
  if (updated.registered) markAuthenticated(updated)
  else saveUnlockedWallet(updated)
  return updated
}

function WalletVerificationCard({ currentUser, onUserUpdate }) {
  const [status, setStatus] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const verify = async () => {
    if (isBusy) return
    setIsBusy(true)
    setStatus('Checking local wallet ownership...')
    try {
      const updated = await verifyWalletLocally(currentUser)
      onUserUpdate(updated)
      setStatus(`Wallet verified: ${updated.wallet.slice(0, 6)}...${updated.wallet.slice(-4)}`)
    } catch (error) {
      setStatus(safeErrorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="activation-card wallet-verification-card">
      <div>
        <span>Wallet verification</span>
        <h2>Check this device</h2>
        <p>Before posting, Elno checks that this browser can open the encrypted app wallet for your username.</p>
      </div>
      <div className="activation-wallet">
        <code>{currentUser.wallet}</code>
        <CopyButton value={currentUser.wallet}>Copy address</CopyButton>
      </div>
      <div className="activation-actions compact">
        <button className="auth-submit" type="button" disabled={isBusy} onClick={verify}>
          <ShieldCheck aria-hidden="true" />
          <span>{isBusy ? 'Verifying' : 'Verify app wallet'}</span>
        </button>
      </div>
      {status && <p>{status}</p>}
    </section>
  )
}

async function linkRecoveryWallet(currentUser) {
  if (!currentUser.walletSecretKey) throw new Error('Local wallet is locked. Sign in again with your username.')
  const walletSecretKey = Uint8Array.from(currentUser.walletSecretKey)
  if (publicKeyFromSecret(walletSecretKey) !== currentUser.wallet) throw new Error('Local wallet does not match this account.')

  const { provider, publicKey } = await connectBrowserSolanaWallet()
  if (publicKey === currentUser.wallet) throw new Error('Use a different main wallet for recovery, not the generated app wallet.')
  const conflict = findRecoveryWalletConflict(publicKey, accountIdFor(currentUser))
  if (conflict) throw new Error(`This recovery wallet is already linked to ${conflict.handle}. Use a different recovery wallet.`)
  const challenge = base64Url(crypto.getRandomValues(new Uint8Array(24)))
  const linkedAt = new Date().toISOString()
  const { signature } = await signRecoveryWalletMessage(provider, currentUser, challenge)

  const updated = {
    ...currentUser,
    recoveryWallet: publicKey,
    recoveryWalletVerified: true,
    recoveryVault: await encryptRecoverySecretKey(walletSecretKey, signature),
    recoveryChallenge: challenge,
    recoveryWalletLinkedAt: linkedAt,
  }
  saveAccount(updated)
  if (updated.registered) markAuthenticated(updated)
  else saveUnlockedWallet(updated)
  return updated
}

function RecoveryWalletCard({ currentUser, onUserUpdate }) {
  const [status, setStatus] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const connect = async () => {
    if (isBusy) return
    setIsBusy(true)
    setStatus('Waiting for your recovery wallet...')
    try {
      const updated = await linkRecoveryWallet(currentUser)
      onUserUpdate(updated)
      setStatus(`Recovery wallet linked: ${updated.recoveryWallet.slice(0, 6)}...${updated.recoveryWallet.slice(-4)}`)
    } catch (error) {
      setStatus(safeErrorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="activation-card recovery-wallet-card">
      <div>
        <span>Optional recovery</span>
        <h2>Add a recovery wallet</h2>
        <p>Connect your main wallet only if you want another way back into this account. It is not used for posting.</p>
      </div>
      {currentUser.recoveryWalletVerified ? (
        <div className="activation-wallet">
          <code>{currentUser.recoveryWallet}</code>
          <CopyButton value={currentUser.recoveryWallet}>Copy address</CopyButton>
        </div>
      ) : (
        <div className="activation-actions compact">
          <button className="auth-submit" type="button" disabled={isBusy} onClick={connect}>
            <Wallet aria-hidden="true" />
            <span>{isBusy ? 'Connecting' : 'Connect recovery wallet'}</span>
          </button>
        </div>
      )}
      {status && <p>{status}</p>}
    </section>
  )
}

async function activateProfileOnMainnet(currentUser, onStatus = () => {}) {
  if (!currentUser.walletSecretKey) throw new Error('Local wallet is locked. Sign in again with your username.')
  if (!currentUser.walletVerified) throw new Error('Verify your wallet before activating your on-chain profile.')

  onStatus('Checking wallet balance...')
  const health = await getSignerHealth()
  const minLamports = Number(health.requiredRegistrationBalanceLamports || health.minUserBalanceLamports || DEFAULT_MIN_USER_BALANCE_LAMPORTS)
  const balanceLamports = await getSolBalanceLamports(currentUser.wallet)
  if (balanceLamports < minLamports) {
    throw new Error(`Wallet has ${formatSol(balanceLamports)}. Add ${formatSol(minLamports)} total before opening this account.`)
  }

  onStatus('Activating profile on Solana...')
  const walletProvider = createLocalWallet(currentUser.walletSecretKey)
  const result = await registerProfileOnMainnet({
    wallet: walletProvider,
    userPublicKey: currentUser.wallet,
    handle: currentUser.handle.replace(/^@/, ''),
    displayName: currentUser.name,
  })
  const registrationProof = await registrationProofFromResult(currentUser, result)
  const updated = {
    ...currentUser,
    fundingStatus: 'funded',
    registered: true,
    registrationProof,
  }
  saveAccount(updated)
  return updated
}

function ActivationCard({ currentUser, onUserUpdate }) {
  const [balanceLamports, setBalanceLamports] = useState(null)
  const [minBalanceLamports, setMinBalanceLamports] = useState(DEFAULT_MIN_USER_BALANCE_LAMPORTS)
  const [minBalanceLabel, setMinBalanceLabel] = useState(REGISTRATION_FEE_LABEL)
  const [status, setStatus] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const refreshBalance = async () => {
    const health = await getSignerHealth()
    const nextMin = Number(health.requiredRegistrationBalanceLamports || health.minUserBalanceLamports || DEFAULT_MIN_USER_BALANCE_LAMPORTS)
    const nextLabel = health.requiredRegistrationBalanceLabel
      ? `${health.registrationFeeLabel || 'Username free now'} · rent + network fee${health.requiredRegistrationBalanceUsd ? ` ≈ ${health.requiredRegistrationBalanceUsd}` : ''}`
      : health.minUserBalanceLabel || REGISTRATION_FEE_LABEL
    const lamports = await getSolBalanceLamports(currentUser.wallet)
    setMinBalanceLamports(nextMin)
    setMinBalanceLabel(nextLabel)
    setBalanceLamports(lamports)
    return { funded: lamports >= nextMin, lamports, minLamports: nextMin }
  }

  const activate = async () => {
    if (isBusy) return
    setIsBusy(true)
    try {
      const updated = await activateProfileOnMainnet(currentUser, setStatus)
      onUserUpdate(updated)
      setStatus(`Username claimed: ${updated.registrationProof.usernameTx.slice(0, 10)}...`)
    } catch (error) {
      setStatus(safeErrorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  const checkBalance = async () => {
    if (isBusy) return
    setIsBusy(true)
    try {
      const { funded, lamports, minLamports } = await refreshBalance()
      setStatus(funded ? 'Wallet balance is ready for activation.' : `Wallet has ${formatSol(lamports)}. Needed to open account: ${formatSol(minLamports)}.`)
    } catch (error) {
      setStatus(safeErrorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="activation-card">
      <div>
        <span>Account ready</span>
        <h2>Activate {currentUser.handle}</h2>
        <p>Claim the username on-chain once. It's free right now — you only pay account rent and the network fee. After this, posts use the low-cost publish path.</p>
      </div>
      <div className="activation-wallet">
        <code>{currentUser.wallet}</code>
        <CopyButton value={currentUser.wallet}>Copy address</CopyButton>
      </div>
      <div className="activation-actions">
        <div className={`balance-card ${balanceLamports !== null && balanceLamports >= minBalanceLamports ? 'ready' : ''}`}>
          <span>Required</span>
          <strong>{balanceLamports === null ? formatSol(minBalanceLamports) : formatSol(balanceLamports)}</strong>
          <small>{balanceLamports === null ? minBalanceLabel : `Needed: ${formatSol(minBalanceLamports)}`}</small>
        </div>
        <button className="auth-submit secondary" type="button" disabled={isBusy} onClick={checkBalance}>
          <Wallet aria-hidden="true" />
          <span>Check balance</span>
        </button>
        <button className="auth-submit" type="button" disabled={isBusy} onClick={activate}>
          <KeyRound aria-hidden="true" />
          <span>Check and activate</span>
        </button>
      </div>
      {status && <p>{status}</p>}
    </section>
  )
}

function Shell({ activeView, setActiveView, currentUser, children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <ElnoMark />
          </div>
          <div>
            <span>On-chain social</span>
            <strong>Elno</strong>
          </div>
        </div>

        <nav className="side-nav" aria-label="App navigation">
          {navItems.map(({ id, label, icon: Icon, soon }) => (
            <button
              key={id}
              className={`${activeView === id ? 'active' : ''}${soon ? ' soon' : ''}`}
              type="button"
              disabled={soon}
              title={soon ? 'Coming soon' : undefined}
              onClick={soon ? undefined : () => setActiveView(id)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {soon && <em className="soon-badge">Soon</em>}
            </button>
          ))}
        </nav>

        <div className="wallet-card">
          <span>App wallet</span>
          <strong>{shortAddress(currentUser.wallet)}</strong>
          <small>{currentUser.walletVerified ? 'Verified wallet' : 'Unverified wallet'} · {currentUser.registered ? 'Registered' : 'Unregistered'} · {currentUser.handle}</small>
        </div>
      </aside>

      {children}
    </div>
  )
}

function TopBar({ activeView, currentUser, onLogout, setActiveView }) {
  const titles = {
    feed: ['Open Feed', 'Public posts. Verifiable by default.'],
    messages: ['Messages', 'Encrypted wallet-to-wallet conversations.'],
    profile: ['Profile', 'Your public protocol identity.'],
    packets: ['Packet Inspector', 'Decode, copy and verify social payloads.'],
    settings: ['Settings', 'Wallet, recovery, and proof controls.'],
  }
  const [title, subtitle] = titles[activeView]

  return (
    <header className="topbar">
      <div>
        <span>{activeView}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="top-actions">
        <div className="network-badge">
          <ShieldCheck aria-hidden="true" />
          <span>Mainnet</span>
          <small>IDL live</small>
        </div>
        <button type="button" aria-label="Search" disabled title="Search is coming soon">
          <Search aria-hidden="true" />
        </button>
        <button type="button" aria-label="Notifications" disabled title="Notifications are coming soon">
          <Bell aria-hidden="true" />
        </button>
        <button type="button" aria-label="Settings" onClick={() => setActiveView('settings')}>
          <Settings aria-hidden="true" />
        </button>
        <button className="session-pill" type="button" onClick={onLogout} aria-label="Sign out">
          <span>Sign out</span>
          <small>{currentUser.handle}</small>
        </button>
      </div>
    </header>
  )
}

function Composer({ brotli, onPublish, currentUser, setCurrentPacket, onUserUpdate }) {
  const [text, setText] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaKind, setMediaKind] = useState('')
  const [mediaHash, setMediaHash] = useState('')
  const [mediaId, setMediaId] = useState('')
  const [mediaName, setMediaName] = useState('')
  const [mediaBytes, setMediaBytes] = useState(0)
  const [mediaHostedBy, setMediaHostedBy] = useState('')
  const [mediaIntegrity, setMediaIntegrity] = useState('')
  const [uploadState, setUploadState] = useState('idle')
  const [mode, setMode] = useState('bin')
  const [txStatus, setTxStatus] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [showDeveloper, setShowDeveloper] = useState(false)
  const [lastReceipt, setLastReceipt] = useState(null)
  const [balanceLamports, setBalanceLamports] = useState(null)
  const uploadSeq = useRef(0)

  // Kalan post hakki: cuzdan bakiyesi / post basina taban ucret (5.000 lamport, event-post rent yok).
  const POST_FEE_LAMPORTS = 5000
  const remainingPosts = balanceLamports != null ? Math.floor(balanceLamports / POST_FEE_LAMPORTS) : null

  useEffect(() => {
    let alive = true
    getSolBalanceLamports(currentUser.wallet)
      .then((lamports) => {
        if (alive) setBalanceLamports(lamports)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [currentUser.wallet])

  const media = useMemo(
    () =>
      mediaUrl
        ? {
            kind: mediaKind || 'application/octet-stream',
            url: mediaUrl,
            id: mediaId,
            hash: mediaHash ? (mediaHash.startsWith('sha256:') ? mediaHash : `sha256:${mediaHash}`) : '',
          }
        : null,
    [mediaHash, mediaId, mediaKind, mediaUrl],
  )

  const packet = useMemo(
    () =>
      makePacket({
        text,
        media,
        mode,
        brotli,
      }),
    [brotli, media, mode, text],
  )

  useEffect(() => {
    if (text.trim() || mediaUrl.trim()) {
      setCurrentPacket(packet)
    } else {
      setCurrentPacket(null)
    }
  }, [mediaUrl, packet, setCurrentPacket, text])

  const clearMedia = () => {
    uploadSeq.current += 1
    setMediaUrl('')
    setMediaKind('')
    setMediaHash('')
    setMediaId('')
    setMediaName('')
    setMediaBytes(0)
    setMediaHostedBy('')
    setMediaIntegrity('')
    setUploadState('idle')
  }

  const uploadMedia = async (file) => {
    if (!file) return
    const seq = uploadSeq.current + 1
    uploadSeq.current = seq
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setTxStatus('Choose an image or video file.')
      setUploadState('error')
      return
    }
    setUploadState('uploading')
    setTxStatus('Uploading media and calculating SHA-256 proof...')
    try {
      const uploaded = await uploadMediaForPost(file)
      if (seq !== uploadSeq.current) return
      setMediaUrl(uploaded.url)
      setMediaKind(uploaded.kind || file.type)
      setMediaHash(uploaded.hash)
      setMediaId(uploaded.mediaId || uploaded.filename || '')
      setMediaName(file.name || uploaded.filename || 'media')
      setMediaBytes(Number(uploaded.bytes || file.size || 0))
      setMediaHostedBy(uploaded.hostedBy || 'osocial-media-v0')
      setMediaIntegrity(uploaded.integrity || '')
      setUploadState('done')
      setTxStatus('Media stored by Elno Media. Compact mediaId and SHA-256 proof attached.')
    } catch (error) {
      if (seq !== uploadSeq.current) return
      setUploadState('error')
      setTxStatus(safeErrorMessage(error))
    }
  }

  const publish = async () => {
    if (!canPublish) return
    if (overLimit) {
      setTxStatus('Packet is over the 1,024 B on-chain limit. Shorten text or switch to Binary/Brotli.')
      return
    }
    setTxStatus(currentUser.registered ? 'Preparing on-chain post...' : 'Activating account, then publishing...')
    setIsPublishing(true)
    try {
      let publishingUser = currentUser
      if (!publishingUser.walletVerified) {
        throw new Error('Verify your wallet before publishing.')
      }
      if (!publishingUser.registered) {
        publishingUser = await activateProfileOnMainnet(publishingUser, setTxStatus)
        onUserUpdate(publishingUser)
        setTxStatus('Profile activated. Publishing post...')
      }
      if (!publishingUser.walletSecretKey) throw new Error('Local wallet is locked. Sign in again with your username.')
      const walletProvider = createLocalWallet(publishingUser.walletSecretKey)
      const connected = walletProvider.publicKey.toBase58()
      if (connected !== publishingUser.wallet) throw new Error(`Local wallet ${connected} does not match profile wallet ${publishingUser.wallet}.`)
      const result = await createPostOnMainnet({
        wallet: walletProvider,
        userPublicKey: publishingUser.wallet,
        packet: packet.memo,
        memoPreview: buildPostMemoPreview({ text, mediaUrl: media?.url, mediaId: media?.id }),
      })

      const receipt = {
        signature: result.signature,
        instruction: result.instruction || 'osocial_post',
        sequence: result.sequence,
        packetBytes: packet.memoBytes,
        feeLamports: result.expectedBaseFeeLamports || '5000',
        storageMode: result.storageMode || 'event',
        memoIncluded: result.memoIncluded,
      }

      onPublish({
        id: `post-${Date.now()}`,
        author: publicAuthor(publishingUser),
        createdAt: 'now',
        text,
        media,
        proofTx: result.signature,
        stats: { replies: 0, reposts: 0, likes: 0 },
        liked: false,
        reposted: false,
        saved: false,
        packetMode: packet.actualMode,
        packet: packet.memo,
        receipt,
        programProof: {
          programId: REGISTRY_PROGRAM_ID,
          instruction: result.instruction || (result.storageMode === 'event' ? 'osocial_post' : 'create_post'),
          feePayer: publishingUser.wallet,
          platformCoSigner: result.authority || null,
          signature: result.signature,
          postPda: result.post,
          sequence: result.sequence,
          expectedBaseFeeLamports: result.expectedBaseFeeLamports || '5000',
          packetBytes: packet.memoBytes,
          memoIncluded: result.memoIncluded,
          memo: result.memo,
          profile: result.profile,
          storageMode: result.storageMode || 'account',
          realMainnet: true,
        },
        replies: [],
      })
      setLastReceipt(receipt)
      setCurrentPacket(packet)
      setText('')
      clearMedia()
      setTxStatus(`Mainnet post confirmed: ${result.signature.slice(0, 10)}...`)
      getSolBalanceLamports(publishingUser.wallet)
        .then((lamports) => setBalanceLamports(lamports))
        .catch(() => {})
    } catch (error) {
      setTxStatus(safeErrorMessage(error))
    } finally {
      setIsPublishing(false)
    }
  }

  const size = packet.memoBytes
  const hardLimit = 1024
  const overLimit = size > hardLimit
  const uploadPending = uploadState === 'uploading'
  const canPublish = !isPublishing && !uploadPending && !overLimit && currentUser.walletVerified && Boolean(currentUser.walletSecretKey) && Boolean(text.trim() || mediaUrl.trim())
  const targetClass = overLimit ? 'bad over-limit' : size <= 700 ? 'good' : size <= SINGLE_TX_SOFT_PACKET_BYTES ? 'warn' : 'bad'

  return (
    <section className="composer-card">
      <div className="composer-topline">
        <div>
          <span>Publish as</span>
          <strong>{currentUser.handle}</strong>
          <MiniBars values={[18, 24, 32, 36, 48, 52]} tone="soft" />
        </div>
        <div>
          <span>Post path</span>
          <strong>event log</strong>
          <FlowGraphic steps={['wallet', 'tx', 'rpc']} />
        </div>
        <div>
          <span>Kalan post hakkın</span>
          <strong>{remainingPosts != null ? `~${remainingPosts.toLocaleString('tr-TR')} post` : '—'}</strong>
          <RingMeter value={76} label="≈5k lamport" detail="post başına" tone="soft" />
        </div>
      </div>
      <div className="composer-head">
        <Avatar
          author={{
            name: currentUser.name,
            accent: currentUser.accent,
          }}
        />
        <textarea value={text} rows={4} placeholder="What's happening?" onChange={(event) => setText(event.target.value)} />
      </div>

      {mediaUrl && (
        <div className="media-preview">
          {mediaKind.startsWith('video/') ? <video src={mediaUrl} controls playsInline /> : <img src={mediaUrl} alt="" />}
          <div>
            <span>{mediaName || 'Uploaded media'}</span>
            <strong>{mediaHostedBy ? 'Hosted by Elno Media' : 'media attached'}</strong>
            <code>
              <Fingerprint aria-hidden="true" />
              {mediaId ? shortAddress(mediaId, 12, 8) : mediaHash ? shortAddress(mediaHash.replace(/^sha256:/, ''), 10, 8) : 'hash pending'}
            </code>
            <div className="media-proof-actions">
              <a href={mediaUrl} target="_blank" rel="noreferrer">
                <Link aria-hidden="true" />
                Open media
              </a>
              <CopyButton value={mediaUrl}>Copy link</CopyButton>
            </div>
            <small>{mediaKind || 'media'} {mediaBytes ? `- ${formatBytes(mediaBytes)}` : ''}{mediaId ? ' - short mediaId on-chain' : mediaIntegrity ? ' - immutable SHA-256' : ''}</small>
          </div>
          <button type="button" aria-label="Remove media" onClick={clearMedia}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="composer-toolbar">
        <IconButton icon={Braces} className="developer-toggle" onClick={() => setShowDeveloper((current) => !current)}>
          {showDeveloper ? 'Hide packet' : 'Packet'}
        </IconButton>

        <IconButton icon={Send} className="publish-button" disabled={!canPublish} onClick={publish}>
          {isPublishing
            ? 'Signing'
            : !currentUser.walletVerified
              ? 'Verify wallet first'
              : !currentUser.walletSecretKey
                ? 'Unlocking wallet'
                : currentUser.registered
                  ? 'Publish'
                  : 'Activate & Publish'}
        </IconButton>
      </div>
      {showDeveloper && (
        <div className="composer-dev-panel">
          <div className="segmented">
            <button className={mode === 'bin' ? 'active' : ''} type="button" onClick={() => setMode('bin')}>
              Binary
            </button>
            <button className={mode === 'json' ? 'active' : ''} type="button" onClick={() => setMode('json')}>
              JSON
            </button>
            <button className={mode === 'br' ? 'active' : ''} type="button" disabled={!brotli} onClick={() => setMode('br')}>
              {brotli ? 'Brotli' : 'Brotli loading'}
            </button>
          </div>
          <div className={`size-pill ${targetClass}`}>
            <Zap aria-hidden="true" />
            <span>{size} / {hardLimit} B</span>
          </div>
          <div className="composer-proof-row">
            <span className="proof-dot" />
            <strong>Checked at publish</strong>
            <span>{size} B packet</span>
            <span>soft target {SINGLE_TX_SOFT_PACKET_BYTES} B</span>
            <span>{packet.actualMode === 'bin' ? 'v2 binary packet' : packet.actualMode === 'br' ? 'Brotli packet' : 'Readable JSON'}</span>
            <span>one Solana transaction</span>
          </div>
        </div>
      )}
      {txStatus && <p className="composer-status" role="status" aria-live="polite">{txStatus}</p>}
      {lastReceipt && <PublishReceipt receipt={lastReceipt} />}
    </section>
  )
}

function PublishReceipt({ receipt }) {
  const tx = receipt.signature
  return (
    <div className="publish-receipt">
      <div>
        <span>Post receipt</span>
        <strong>Post confirmed on Solana mainnet</strong>
      </div>
      <dl>
        <div>
          <dt>Post sequence</dt>
          <dd>{receipt.sequence ?? 'event'}</dd>
        </div>
        <div>
          <dt>Base fee estimate</dt>
          <dd>{Number(receipt.feeLamports || 5000).toLocaleString()} lamports</dd>
        </div>
        <div>
          <dt>Packet size</dt>
          <dd>{receipt.packetBytes} B</dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd>{receipt.storageMode === 'event' ? 'Event log' : 'Account'}</dd>
        </div>
        <div>
          <dt>Memo preview</dt>
          <dd>{receipt.memoIncluded ? 'Included' : 'Omitted'}</dd>
        </div>
      </dl>
      {tx && (
        <div className="receipt-actions">
          <a href={`https://solscan.io/tx/${tx}`} target="_blank" rel="noreferrer">
            Solscan
          </a>
          <a href={`https://orbmarkets.io/tx/${tx}`} target="_blank" rel="noreferrer">
            Orb
          </a>
        </div>
      )}
    </div>
  )
}

function PostCard({ post, onReply, onQuote, onInspect }) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quoteText, setQuoteText] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const submitReply = async () => {
    if (!replyText.trim() || actionBusy) return
    setActionBusy(true)
    setActionError('')
    try {
      await onReply(post.id, replyText)
      setReplyText('')
      setReplyOpen(false)
    } catch (error) {
      setActionError(error?.message || 'Reply failed.')
    } finally {
      setActionBusy(false)
    }
  }
  const submitQuote = async () => {
    if (!quoteText.trim() || actionBusy) return
    setActionBusy(true)
    setActionError('')
    try {
      await onQuote(post, quoteText)
      setQuoteText('')
      setQuoteOpen(false)
    } catch (error) {
      setActionError(error?.message || 'Quote failed.')
    } finally {
      setActionBusy(false)
    }
  }
  const tx = post.programProof?.signature || post.proofTx
  const instruction = post.programProof?.instruction || (post.packetMode === 'br' ? 'osocial_post' : 'osocial_post')
  const packetBytes = post.packet ? byteLength(post.packet) : 0
  const feeLamports = post.receipt?.feeLamports || post.programProof?.expectedBaseFeeLamports || '5000'
  const isVerified = Boolean(tx)
  const mediaUrl = resolveMediaUrl(post.media)

  return (
    <article className="post-card">
      <Avatar author={post.author} />
      <div className="post-body">
        <header className="post-header">
          <div>
            <strong>{post.author.name}</strong>
            <span>{post.author.handle}</span>
            {post.author.wallet && <span>{shortAddress(post.author.wallet)}</span>}
            <span>{post.createdAt}</span>
          </div>
          <button type="button" aria-label="More actions" disabled title="Post actions are coming soon">
            <MoreHorizontal aria-hidden="true" />
          </button>
        </header>

        <p>{post.text}</p>

        {post.quoteOf && (
          <div className="quote-embed">
            <div className="quote-embed-head">
              <strong>{post.quoteOf.author?.name}</strong>
              <span>{post.quoteOf.author?.handle}</span>
              {post.quoteOf.createdAt && <span>· {post.quoteOf.createdAt}</span>}
            </div>
            <p>{post.quoteOf.text}</p>
          </div>
        )}

        {mediaUrl && (
          <figure className="post-media">
            {post.media.kind?.startsWith('video/') ? (
              <video src={mediaUrl} controls playsInline />
            ) : (
              <img src={mediaUrl} alt="" />
            )}
            <figcaption>
              <Image aria-hidden="true" />
              <span>{post.media.kind}</span>
              {(post.media.id || post.media.hash) && <code>{post.media.id || post.media.hash}</code>}
            </figcaption>
          </figure>
        )}

        <div className={`post-proof-strip ${isVerified ? 'is-verified' : 'is-sample'}`}>
          <span>
            <ShieldCheck aria-hidden="true" />
            {isVerified ? 'Verified on mainnet' : 'Sample post'}
          </span>
          {post.programProof?.sequence !== undefined && <span>index {post.programProof.sequence}</span>}
          {packetBytes > 0 && <span>{packetBytes} B</span>}
          {isVerified && <span>{Number(feeLamports).toLocaleString()} lamports</span>}
          {tx && (
            <a href={`https://solscan.io/tx/${tx}`} target="_blank" rel="noreferrer">
              View tx
            </a>
          )}
        </div>

        <details className="post-proof-details">
          <summary>Proof details</summary>
          <div>
            <span>Instruction</span>
            <code>{instruction}</code>
            <span>Storage</span>
            <code>{post.programProof?.storageMode === 'event' ? 'event log' : 'account packet'}</code>
            {tx && (
              <>
                <span>Transaction</span>
                <code>{tx}</code>
                <a href={`https://orbmarkets.io/tx/${tx}`} target="_blank" rel="noreferrer">
                  Open in Orb
                </a>
              </>
            )}
          </div>
        </details>

        {post.replies?.length > 0 && (
          <div className="reply-stack">
            {post.replies.map((reply) => (
              <div key={reply.id}>
                <strong>{reply.author}</strong>
                <span>{reply.text}</span>
              </div>
            ))}
          </div>
        )}

        {replyOpen && (
          <div className="reply-box">
            <input value={replyText} placeholder="Reply with a packet..." disabled={actionBusy} onChange={(event) => setReplyText(event.target.value)} />
            <button type="button" disabled={!replyText.trim() || actionBusy} onClick={submitReply}>
              {actionBusy ? 'Sending…' : 'Reply'}
            </button>
          </div>
        )}

        {quoteOpen && (
          <div className="reply-box quote-box">
            <input value={quoteText} placeholder="Add your comment, then quote this post..." disabled={actionBusy} onChange={(event) => setQuoteText(event.target.value)} />
            <button type="button" disabled={!quoteText.trim() || actionBusy} onClick={submitQuote}>
              {actionBusy ? 'Sending…' : 'Quote'}
            </button>
          </div>
        )}

        {actionError && <p className="post-action-error">{actionError}</p>}

        <footer className="post-actions">
          <button type="button" aria-label="Reply to post" aria-expanded={replyOpen} onClick={() => setReplyOpen((current) => !current)}>
            <MessageCircle aria-hidden="true" />
            <span>{post.stats.replies + (post.replies?.length || 0)}</span>
          </button>
          <button className={quoteOpen ? 'active' : ''} type="button" aria-label="Quote post" aria-expanded={quoteOpen} onClick={() => setQuoteOpen((current) => !current)}>
            <Quote aria-hidden="true" />
            <span>Quote</span>
          </button>
          <button type="button" aria-label="Inspect packet" onClick={() => onInspect(post)}>
            <Braces aria-hidden="true" />
            <span>Packet</span>
          </button>
        </footer>
      </div>
    </article>
  )
}

function SetupBanner({ currentUser, setActiveView }) {
  const missing = []
  if (!currentUser.walletVerified) missing.push('verify app wallet')
  if (!currentUser.registered) missing.push('activate username')
  if (!currentUser.recoveryWalletVerified) missing.push('optional recovery')

  if (!missing.length) return null

  return (
    <section className="setup-banner">
      <div>
        <span>Account setup</span>
        <strong>{missing[0]}</strong>
        <p>Finish setup in Settings. The feed stays clean; account controls live in one place.</p>
      </div>
      <button type="button" onClick={() => setActiveView('settings')}>
        Open settings
      </button>
    </section>
  )
}

function FeedView({ brotli, posts, setPosts, currentUser, currentPacket, setCurrentPacket, onInspect, onUserUpdate, setActiveView }) {
  const [showDeveloperRail, setShowDeveloperRail] = useState(false)

  const publishPost = (post) => {
    setPosts((current) => [post, ...current])
  }

  const parentRef = (post) => post?.proofTx || post?.programProof?.signature || ''

  // Alinti: gercekten zincire elnoquote olarak yazar, sonra feed'e ekler.
  const quote = async (sourcePost, text) => {
    const quoteOf = parentRef(sourcePost)
    if (!quoteOf) throw new Error('You can only quote on-chain posts (this one has no transaction yet).')
    if (!currentUser.walletSecretKey) throw new Error('Sign in with your key to quote.')
    const packet = makePacket({ text, media: null, mode: 'bin', brotli })
    const walletProvider = createLocalWallet(currentUser.walletSecretKey)
    const result = await createQuoteOnMainnet({
      wallet: walletProvider,
      userPublicKey: currentUser.wallet,
      packet: packet.memo,
      quoteOf,
      memoPreview: buildPostMemoPreview({ text }),
    })
    const quotePost = {
      id: `quote-${result.signature.slice(0, 10)}`,
      author: { name: currentUser.name, handle: currentUser.handle, wallet: currentUser.wallet, accent: currentUser.accent },
      text,
      createdAt: 'now',
      stats: { replies: 0, reposts: 0, likes: 0 },
      proofTx: result.signature,
      programProof: { signature: result.signature, instruction: 'elnoquote', realMainnet: true },
      quoteOf: { id: sourcePost.id, text: sourcePost.text, author: sourcePost.author, createdAt: sourcePost.createdAt },
    }
    setPosts((current) => [quotePost, ...current])
  }

  // Yanit: gercekten zincire elnoreply olarak yazar (reply_to = parent tx), sonra parent altina ekler.
  const reply = async (id, text) => {
    const parent = posts.find((post) => post.id === id)
    const replyTo = parentRef(parent)
    if (!replyTo) throw new Error('You can only reply to on-chain posts (this one has no transaction yet).')
    if (!currentUser.walletSecretKey) throw new Error('Sign in with your key to reply.')
    const packet = makePacket({ text, media: null, mode: 'bin', brotli })
    const walletProvider = createLocalWallet(currentUser.walletSecretKey)
    const result = await createReplyOnMainnet({
      wallet: walletProvider,
      userPublicKey: currentUser.wallet,
      packet: packet.memo,
      replyTo,
      memoPreview: buildPostMemoPreview({ text }),
    })
    setPosts((current) =>
      current.map((post) =>
        post.id === id
          ? { ...post, replies: [...(post.replies || []), { id: `reply-${result.signature.slice(0, 10)}`, author: currentUser.name, text, proofTx: result.signature }] }
          : post,
      ),
    )
  }

  return (
    <div className="feed-layout">
      <main className="feed-main">
        <SetupBanner currentUser={currentUser} setActiveView={setActiveView} />
        <Composer brotli={brotli} onPublish={publishPost} currentUser={currentUser} setCurrentPacket={setCurrentPacket} onUserUpdate={onUserUpdate} />
        <div className="feed-list">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onReply={reply} onQuote={quote} onInspect={onInspect} />
          ))}
        </div>
      </main>

      <aside className="right-rail">
        <div className="rail-panel graph-panel">
          <div className="rail-graph-head">
            <div>
              <span>Network graph</span>
              <strong>Protocol health</strong>
            </div>
            <RingMeter value={currentUser.registered ? 92 : 48} label="readiness" detail={currentUser.registered ? 'active profile' : 'setup pending'} />
          </div>
          <FlowGraphic steps={['write', 'verify', 'read']} />
          <MiniBars values={[posts.length + 8, 22, 18, currentPacket?.memoBytes ? 34 : 14, 42, 56, 49, 64]} tone="link" />
        </div>

        <div className="rail-panel">
          <span>Account</span>
          <div className="pulse-row">
            <strong>{currentUser.handle}</strong>
            <small>{currentUser.registered ? 'active' : 'not activated'}</small>
          </div>
          <div className="pulse-row">
            <strong>{shortAddress(currentUser.wallet)}</strong>
            <small>app wallet</small>
          </div>
          <div className="pulse-row">
            <strong>{posts.length}</strong>
            <small>posts loaded</small>
          </div>
          <button className="rail-toggle" type="button" onClick={() => setShowDeveloperRail((current) => !current)}>
            {showDeveloperRail ? 'Hide protocol' : 'Show protocol'}
          </button>
        </div>

        {showDeveloperRail && (
          <>
            <div className="rail-panel proof-panel">
              <span>Elno program</span>
              <strong>Explorer-readable registry</strong>
              <code>{shortAddress(REGISTRY_PROGRAM_ID, 8, 8)}</code>
              <a href={`https://solscan.io/account/${REGISTRY_PROGRAM_ID}`} target="_blank" rel="noreferrer">
                <Link aria-hidden="true" />
                View program
              </a>
              <a href={`https://solscan.io/tx/${MAINNET_TX}`} target="_blank" rel="noreferrer">
                <Link aria-hidden="true" />
                View demo transaction
              </a>
            </div>

            <div className="rail-panel">
              <span>Protocol status</span>
              {['1 tx per post', '0 rent post storage', 'Open RPC indexing'].map((handle) => (
                <div className="trend-row" key={handle}>
                  <Check aria-hidden="true" />
                  <strong>{handle}</strong>
                </div>
              ))}
              <div className="pulse-row">
                <strong>{currentPacket?.memoBytes || 0} B</strong>
                <small>latest packet</small>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

function MessagesView({ brotli, currentUser }) {
  const [localPeer, setLocalPeer] = useState(null)
  const [remotePeer, setRemotePeer] = useState(null)
  const [draft, setDraft] = useState('This DM is off-chain. Solana proves the profile; Peer carries the private text.')
  const [messages, setMessages] = useState([])
  const [packet, setPacket] = useState('')
  const [invite, setInvite] = useState(null)
  const [roomId, setRoomId] = useState('founders-room')
  const [status, setStatus] = useState('Preparing local peer identity...')
  const canSendMessage = Boolean(localPeer && remotePeer && draft.trim())

  useEffect(() => {
    let mounted = true
    Promise.all([
      generatePeerIdentity({
        label: currentUser.handle,
        wallet: currentUser.wallet,
        handle: currentUser.handle,
      }),
      generatePeerIdentity({
        label: 'Viktorie',
        wallet: 'demo-peer-viktorie',
        handle: '@viktorie',
      }),
    ]).then(([nextLocal, nextRemote]) => {
      if (!mounted) return
      setLocalPeer(nextLocal)
      setRemotePeer(nextRemote)
      setStatus('Peer identity ready. Transport prototype lives in /peer.')
    })
    return () => {
      mounted = false
    }
  }, [currentUser.handle, currentUser.wallet])

  useEffect(() => {
    let mounted = true
    if (!localPeer || !roomId.trim()) return undefined
    createPeerInvite({ roomId: roomId.trim(), owner: localPeer }).then((nextInvite) => {
      if (!mounted) return
      setInvite(nextInvite)
    })
    return () => {
      mounted = false
    }
  }, [localPeer, roomId])

  const sendMessage = async () => {
    if (!canSendMessage) return
    const envelope = await encryptPeerText({
      sender: localPeer,
      recipient: remotePeer,
      text: draft.trim(),
      roomId: roomId.trim() || 'direct',
      brotli,
    })
    const decoded = await decryptPeerText({
      recipient: remotePeer,
      senderPublicJwk: localPeer.publicJwk,
      envelope,
      brotli,
    })

    setPacket(JSON.stringify(envelope, null, 2))
    setMessages((current) => [
      ...current,
      {
        id: `dm-${Date.now()}`,
        text: decoded.text,
        roomId: decoded.roomId,
        packetBytes: byteLength(JSON.stringify(envelope)),
      },
    ])
    setDraft('')
    setStatus('Encrypted locally, transported off-chain, opened by recipient key.')
  }

  return (
    <main className="messages-layout">
      <section className="thread-panel">
        <div className="thread-header">
          <div className="contact-avatar">VI</div>
          <div>
            <strong>Viktorie Peer</strong>
            <span>{remotePeer?.wallet || 'generating peer keys...'}</span>
          </div>
          <Lock aria-hidden="true" />
        </div>

        <div className="peer-route">
          <div>
            <span>Room</span>
            <input value={roomId} onChange={(event) => setRoomId(event.target.value)} aria-label="Peer room id" />
          </div>
          <div>
            <span>Transport</span>
            <strong>P2P target</strong>
            <small>Hyperswarm prototype</small>
          </div>
          <div>
            <span>Status</span>
            <strong>{localPeer ? 'Ready' : 'Preparing'}</strong>
            <small>{status}</small>
          </div>
        </div>

        <div className="message-list">
          <div className="message-bubble system">Solana remains public identity. This room is off-chain and encrypted before transport.</div>
          <div className="message-bubble received">Invite opens the same peer topic. If both devices are online, traffic can go direct.</div>
          {messages.map((message) => (
            <div className="message-bubble sent" key={message.id}>
              {message.text}
              <span>{message.packetBytes} B encrypted packet · {message.roomId}</span>
            </div>
          ))}
        </div>

        <div className="message-composer">
          <input value={draft} placeholder="Encrypted wallet message..." onChange={(event) => setDraft(event.target.value)} />
          <button type="button" aria-label="Send encrypted message" disabled={!canSendMessage} onClick={sendMessage}>
            <Send aria-hidden="true" />
          </button>
        </div>
      </section>

      <aside className="packet-panel">
        <span>Peer invite</span>
        <code>{invite ? JSON.stringify(invite, null, 2) : 'Generating invite...'}</code>
        <CopyButton value={invite ? JSON.stringify(invite) : ''}>Copy invite</CopyButton>
        <span>Encrypted packet</span>
        <code>{packet || 'Send a message to create ciphertext.'}</code>
        <CopyButton value={packet || ''}>Copy packet</CopyButton>
      </aside>
    </main>
  )
}

function ProfileView({ posts, currentUser }) {
  const ownPosts = posts.filter((post) => post.author.handle === currentUser.handle)

  return (
    <main className="profile-layout">
      <section className="profile-card">
        <div className="profile-cover" />
        <div className="profile-body">
          <div className="profile-avatar" style={{ '--avatar-accent': currentUser.accent }}>
            {currentUser.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </div>
          <button type="button" disabled title="Profile editing is coming soon">Edit profile</button>
          <h2>{currentUser.name}</h2>
          <span>{currentUser.handle}</span>
          <p>Building an open social data layer where every client can read the same public graph.</p>
          <code>{currentUser.wallet}</code>
          <div className="profile-key-actions">
            <CopyButton value={currentUser.wallet}>Copy address</CopyButton>
          </div>
          {currentUser.registrationProof && (
            <div className="registry-proof-card">
              <span>Username</span>
              <code>{currentUser.registrationProof.username || currentUser.handle}</code>
              <span>Username tx</span>
              <a href={`https://solscan.io/tx/${currentUser.registrationProof.usernameTx || currentUser.registrationProof.signature}`} target="_blank" rel="noreferrer">
                {currentUser.registrationProof.usernameTx || currentUser.registrationProof.signature}
              </a>
              <span>Profile PDA</span>
              <code>{currentUser.registrationProof.profilePda}</code>
              <span>Program</span>
              <code>{currentUser.registrationProof.programId}</code>
            </div>
          )}
          <div className="profile-stats">
            <strong>{posts.length}</strong>
            <span>network posts</span>
            <strong>{ownPosts.length}</strong>
            <span>your posts</span>
          </div>
        </div>
      </section>

      <section className="profile-posts">
        <h2>Your posts</h2>
        {ownPosts.length ? (
          ownPosts.map((post) => (
            <div className="mini-post" key={post.id}>
              <p>{post.text}</p>
              <span>{post.programProof?.instruction || post.packetMode} packet</span>
            </div>
          ))
        ) : (
          <div className="empty-card">Your published posts will appear here.</div>
        )}
      </section>
    </main>
  )
}

function SettingsView({ currentUser, onUserUpdate }) {
  const proof = currentUser.registrationProof
  const [keyShown, setKeyShown] = useState(false)
  const secretKeyB58 = currentUser.walletSecretKey ? bs58.encode(Uint8Array.from(currentUser.walletSecretKey)) : ''

  return (
    <main className="settings-layout">
      <section className="settings-panel">
        <div className="panel-head">
          <div>
            <span>Account control</span>
            <h2>Wallet and recovery</h2>
          </div>
          <ShieldCheck aria-hidden="true" />
        </div>

        <div className="settings-visuals">
          <RingMeter
            value={(currentUser.walletVerified ? 34 : 0) + (currentUser.registered ? 33 : 0) + (currentUser.recoveryWalletVerified ? 33 : 0)}
            label="safety score"
            detail="device + claim + recovery"
          />
          <FlowGraphic steps={['device', 'claim', 'recover']} />
        </div>

        <div className="settings-grid">
          <div className="settings-row">
            <div>
              <span>App wallet</span>
              <strong>{shortAddress(currentUser.wallet, 8, 6)}</strong>
              <p>{currentUser.walletVerified ? 'Verified on this device.' : 'Needs local device verification before posting.'}</p>
            </div>
            <CopyButton value={currentUser.wallet}>Copy</CopyButton>
          </div>

          <div className="settings-row">
            <div>
              <span>Username</span>
              <strong>{currentUser.handle}</strong>
              <p>{currentUser.registered ? 'Claimed on-chain.' : 'Not activated yet.'}</p>
            </div>
            <span className={`status-pill ${currentUser.registered ? 'ready' : 'pending'}`}>{currentUser.registered ? 'Ready' : 'Action needed'}</span>
          </div>

          <div className="settings-row">
            <div>
              <span>Recovery wallet</span>
              <strong>{currentUser.recoveryWalletVerified ? shortAddress(currentUser.recoveryWallet, 8, 6) : 'Not linked'}</strong>
              <p>Optional. Used only to get back into this account.</p>
            </div>
            <span className={`status-pill ${currentUser.recoveryWalletVerified ? 'ready' : 'pending'}`}>{currentUser.recoveryWalletVerified ? 'Linked' : 'Optional'}</span>
          </div>
        </div>
      </section>

      <section className="settings-stack">
        <section className="activation-card coming-soon-card">
          <div>
            <span>Roadmap</span>
            <h2>Coming soon</h2>
          </div>
          <ul className="coming-soon-list">
            <li>
              <Image aria-hidden="true" />
              <div>
                <strong>NFT profile photo</strong>
                <span>Set an NFT you own as your verified hexagon avatar.</span>
              </div>
              <em className="soon-badge">Soon</em>
            </li>
            <li>
              <MessageCircle aria-hidden="true" />
              <div>
                <strong>Private messaging</strong>
                <span>End-to-end encrypted peer-to-peer (P2P) DMs.</span>
              </div>
              <em className="soon-badge">Soon</em>
            </li>
          </ul>
        </section>

        <section className="activation-card key-backup-card">
          <div>
            <span>Backup</span>
            <h2>Your login key</h2>
            <p>This private key <strong>is your login</strong>. Save it somewhere safe — anyone who has it controls your account, and it works from any device.</p>
          </div>
          {secretKeyB58 ? (
            <div className="key-backup">
              <span>Private key (base58 — paste into login or Phantom)</span>
              <code className={keyShown ? '' : 'masked'}>{keyShown ? secretKeyB58 : '•'.repeat(44)}</code>
              <div className="wallet-actions">
                <IconButton icon={keyShown ? Lock : Eye} onClick={() => setKeyShown((value) => !value)}>
                  {keyShown ? 'Hide' : 'Reveal key'}
                </IconButton>
                <CopyButton value={secretKeyB58}>Copy key</CopyButton>
              </div>
            </div>
          ) : (
            <p className="key-backup-locked">Wallet is locked. Sign in again with your key or recovery wallet to reveal it.</p>
          )}
        </section>

        {!currentUser.walletVerified && <WalletVerificationCard currentUser={currentUser} onUserUpdate={onUserUpdate} />}
        {!currentUser.registered && <ActivationCard currentUser={currentUser} onUserUpdate={onUserUpdate} />}
        {!currentUser.recoveryWalletVerified && <RecoveryWalletCard currentUser={currentUser} onUserUpdate={onUserUpdate} />}

        {proof && (
          <section className="activation-card advanced-proof-card">
            <div>
              <span>Advanced proof</span>
              <h2>Username claim details</h2>
              <p>Full transaction metadata for explorers and indexers.</p>
            </div>
            <div className="registry-proof-card">
              <span>Username tx</span>
              <a href={`https://solscan.io/tx/${proof.usernameTx || proof.signature}`} target="_blank" rel="noreferrer">
                {proof.usernameTx || proof.signature}
              </a>
              <span>Username index</span>
              <code>{proof.usernameIndex || proof.handleClaim}</code>
              <span>Profile PDA</span>
              <code>{proof.profilePda}</code>
              <span>Instruction</span>
              <code>{proof.instruction}</code>
              <span>Event</span>
              <code>{proof.event || 'ProfileRegistered'}</code>
              <span>All events</span>
              <code>{(proof.events || [proof.event || 'ProfileRegistered']).join(', ')}</code>
              <span>Fee payer</span>
              <code>{proof.feePayer}</code>
              <span>Platform co-signer</span>
              <code>{proof.platformCoSigner}</code>
              <span>Program</span>
              <code>{proof.programId}</code>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

function PacketsView({ brotli, inspectedPost, currentPacket }) {
  const [memo, setMemo] = useState('')
  const [decoded, setDecoded] = useState(null)
  const packetSource = inspectedPost?.packet || currentPacket?.memo || ''

  useEffect(() => {
    setMemo(packetSource)
  }, [packetSource])

  const decodeMemo = () => {
    try {
      setDecoded(decodePacketMemo(memo, brotli))
    } catch {
      setDecoded(null)
    }
  }

  useEffect(() => {
    decodeMemo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brotli, memo])

  const decodedMedia = decoded?.m?.[0]
  const decodedMediaUrl = decodedMedia?.u || osocialMediaUrlFromId(decodedMedia?.i)

  return (
    <main className="packets-layout">
      <section className="packet-workbench">
        <div className="panel-head">
          <div>
            <span>Packet</span>
            <h2>{inspectedPost ? inspectedPost.author.handle : 'Latest draft'}</h2>
          </div>
          <Database aria-hidden="true" />
        </div>
        <textarea value={memo} rows={13} onChange={(event) => setMemo(event.target.value)} />
        <div className="packet-actions">
          <IconButton icon={Eye} onClick={decodeMemo}>
            Decode
          </IconButton>
          <CopyButton value={memo}>Copy memo</CopyButton>
        </div>
      </section>

      <section className="decoded-panel">
        <span>Decoded post</span>
        {decoded ? (
          <>
            <p>{decoded.t || 'Packet decoded successfully. This payload has no text body.'}</p>
            {decodedMediaUrl && (
              <figure>
                {decodedMedia?.k?.startsWith('video/') ? <video src={decodedMediaUrl} controls playsInline /> : <img src={decodedMediaUrl} alt="" />}
                <figcaption>{decodedMedia.i || decodedMedia.h}</figcaption>
              </figure>
            )}
          </>
        ) : (
          <div className="empty-card">No valid packet selected.</div>
        )}
      </section>
    </main>
  )
}

function App() {
  const [currentUser, setCurrentUser] = useState(loadSession)
  const [activeView, setActiveView] = useState('feed')
  const [brotli, setBrotli] = useState(null)
  const [posts, setPosts] = useState(loadPosts)
  const [currentPacket, setCurrentPacket] = useState(null)
  const [inspectedPost, setInspectedPost] = useState(null)

  useEffect(() => {
    let mounted = true
    brotliPromise.then((module) => {
      if (mounted) setBrotli(module)
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (postsStorageReadFailed) {
      postsStorageReadFailed = false
      return
    }
    localStorage.setItem(POSTS_STORAGE_KEY, JSON.stringify(posts.map(sanitizePost)))
  }, [posts])

  useEffect(() => {
    let cancelled = false
    async function unlockActiveWallet() {
      if (!currentUser || currentUser.walletSecretKey || !currentUser.walletVault) return
      if (!isDeviceVault(currentUser.walletVault)) return
      try {
        const unlocked = await unlockStoredAccount(currentUser)
        if (cancelled) return
        markAuthenticated(unlocked)
        setCurrentUser(unlocked)
      } catch {
        // The settings screen will ask the user to recover or verify manually.
      }
    }
    unlockActiveWallet()
    return () => {
      cancelled = true
    }
  }, [currentUser?.id, currentUser?.wallet, currentUser?.walletSecretKey, currentUser?.walletVault])

  const inspectPost = (post) => {
    if (!post.packet) {
      const packet = makePacket({
        text: post.text,
        media: post.media,
        mode: post.packetMode || 'json',
        brotli,
      })
      setInspectedPost({ ...post, packet: packet.memo })
    } else {
      setInspectedPost(post)
    }
    setActiveView('packets')
  }

  const navigate = (view) => {
    if (view === 'packets') setInspectedPost(null)
    setActiveView(view)
  }

  const enterApp = (session) => {
    markAuthenticated(session)
    setCurrentUser(session)
    setActiveView('feed')
  }

  const logout = () => {
    // Tam cikis: her seyi unut. Anahtar = hesap; tekrar girmek icin private key yapistirilir.
    for (const k of [
      ACCOUNTS_STORAGE_KEY,
      ACTIVE_ACCOUNT_STORAGE_KEY,
      ACCOUNT_STORAGE_KEY,
      LEGACY_ACCOUNT_STORAGE_KEY,
      AUTH_STORAGE_KEY,
      POSTS_STORAGE_KEY,
    ]) {
      localStorage.removeItem(k)
    }
    clearUnlockedWallet()
    try {
      window.indexedDB?.deleteDatabase(DEVICE_VAULT_DB_NAME)
    } catch {
      /* yoksay */
    }
    setCurrentUser(null)
    setActiveView('feed')
  }

  if (!currentUser) {
    return <AuthGate onEnter={enterApp} />
  }

  return (
    <Shell activeView={activeView} setActiveView={navigate} currentUser={currentUser}>
      <section className="app-main">
        <TopBar activeView={activeView} currentUser={currentUser} onLogout={logout} setActiveView={navigate} />
        <div hidden={activeView !== 'feed'}>
          <FeedView
            brotli={brotli}
            posts={posts}
            setPosts={setPosts}
            currentUser={currentUser}
            currentPacket={currentPacket}
            setCurrentPacket={setCurrentPacket}
            onInspect={inspectPost}
            onUserUpdate={setCurrentUser}
            setActiveView={navigate}
          />
        </div>
        {activeView === 'profile' && <ProfileView posts={posts} currentUser={currentUser} />}
        {activeView === 'packets' && <PacketsView brotli={brotli} inspectedPost={inspectedPost} currentPacket={currentPacket} />}
        {activeView === 'settings' && <SettingsView currentUser={currentUser} onUserUpdate={setCurrentUser} />}
      </section>
    </Shell>
  )
}

const rootElement = document.getElementById('root')
const root = globalThis.__osocialRoot || createRoot(rootElement)
globalThis.__osocialRoot = root
root.render(<App />)
