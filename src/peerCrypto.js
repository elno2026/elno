const enc = new TextEncoder()
const dec = new TextDecoder()

function getCrypto() {
  const runtimeCrypto = globalThis.crypto
  if (!runtimeCrypto?.subtle || !runtimeCrypto.getRandomValues) {
    throw new Error('WebCrypto is required for Osocial Peer encryption.')
  }
  return runtimeCrypto
}

function encodeBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunk))
    }
    return btoa(binary)
  }
  return Buffer.from(bytes).toString('base64')
}

function decodeBase64(value) {
  if (typeof atob === 'function') {
    const binary = atob(value)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  }
  return Uint8Array.from(Buffer.from(value, 'base64'))
}

export function base64Url(bytes) {
  return encodeBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function fromBase64Url(value) {
  const padded = String(value || '')
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(String(value || '').length / 4) * 4, '=')
  return decodeBase64(padded)
}

export async function sha256Hex(input) {
  const crypto = getCrypto()
  const buffer =
    input instanceof ArrayBuffer
      ? input
      : ArrayBuffer.isView(input)
        ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
        : enc.encode(String(input || ''))
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashPeerTopic(roomId) {
  const digest = await sha256Hex(`osocial-peer:v0:${roomId}`)
  return digest.slice(0, 64)
}

async function exportPublicKey(key) {
  return getCrypto().subtle.exportKey('jwk', key)
}

async function importPublicKey(jwk) {
  return getCrypto().subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
}

export async function generatePeerIdentity({ label, wallet, handle } = {}) {
  const crypto = getCrypto()
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
  const publicJwk = await exportPublicKey(pair.publicKey)
  const fingerprint = (await sha256Hex(JSON.stringify(publicJwk))).slice(0, 16)
  return {
    label: label || handle || 'peer',
    wallet: wallet || `peer-${fingerprint}`,
    handle: handle || '',
    fingerprint,
    pair,
    publicJwk,
  }
}

async function derivePeerKey(privateKey, publicJwk) {
  const publicKey = await importPublicKey(publicJwk)
  return getCrypto().subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function compressPayload(bytes, brotli) {
  if (!brotli) return { bytes, codec: 'json' }
  return { bytes: brotli.compress(bytes, { quality: 8 }), codec: 'br-json' }
}

function decompressPayload(bytes, codec, brotli) {
  if (codec === 'br-json') {
    if (!brotli) throw new Error('Brotli is required to open this peer message.')
    return brotli.decompress(bytes)
  }
  return bytes
}

export async function encryptPeerText({ sender, recipient, text, roomId = 'direct', brotli }) {
  if (!sender?.pair?.privateKey) throw new Error('Sender peer private key is missing.')
  if (!recipient?.publicJwk) throw new Error('Recipient peer public key is missing.')
  if (!String(text || '').trim()) throw new Error('Message cannot be empty.')

  const crypto = getCrypto()
  const key = await derivePeerKey(sender.pair.privateKey, recipient.publicJwk)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const payload = {
    v: 1,
    roomId,
    text,
    createdAt: new Date().toISOString(),
  }
  const compressed = compressPayload(enc.encode(JSON.stringify(payload)), brotli)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed.bytes)
  const senderKeyHash = await sha256Hex(JSON.stringify(sender.publicJwk))
  const recipientKeyHash = await sha256Hex(JSON.stringify(recipient.publicJwk))

  return {
    v: 1,
    type: 'osocial-peer-message',
    route: 'p2p-or-relay',
    roomId,
    from: sender.wallet,
    to: recipient.wallet,
    senderKey: senderKeyHash.slice(0, 32),
    recipientKey: recipientKeyHash.slice(0, 32),
    alg: 'ECDH-P256+A256GCM',
    transport: 'hyperswarm-noise-or-encrypted-relay',
    codec: compressed.codec,
    iv: base64Url(iv),
    c: base64Url(new Uint8Array(cipher)),
  }
}

export async function decryptPeerText({ recipient, senderPublicJwk, envelope, brotli }) {
  if (!recipient?.pair?.privateKey) throw new Error('Recipient peer private key is missing.')
  if (!senderPublicJwk) throw new Error('Sender peer public key is missing.')
  const key = await derivePeerKey(recipient.pair.privateKey, senderPublicJwk)
  const opened = await getCrypto().subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(envelope.iv) },
    key,
    fromBase64Url(envelope.c),
  )
  const plain = decompressPayload(new Uint8Array(opened), envelope.codec, brotli)
  return JSON.parse(dec.decode(plain))
}

export async function createPeerInvite({ roomId, owner }) {
  const topic = await hashPeerTopic(roomId)
  return {
    v: 1,
    type: 'osocial-peer-invite',
    roomId,
    topic,
    owner: {
      wallet: owner.wallet,
      handle: owner.handle,
      key: owner.publicJwk,
      fingerprint: owner.fingerprint,
    },
  }
}
