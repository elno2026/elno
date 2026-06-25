import {
  createPublicKey,
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto'

const TOPIC_CONTEXT = 'osocial-peer-topic:v1'
const MESSAGE_CONTEXT = 'osocial-peer-message-key:v1'
const INFO_CONTEXT = 'osocial-peer-room-message:v1'
const INVITE_PREFIX = 'osocial-peer:v1:'
const MIN_INVITE_SECRET_BYTES = 32

function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ''), 'base64url')
}

function normalizeInvite(invite) {
  const cleanInvite = String(invite || '').trim()
  if (!cleanInvite) throw new Error('Room invite is required.')

  if (cleanInvite.startsWith(INVITE_PREFIX)) {
    const secret = fromBase64Url(cleanInvite.slice(INVITE_PREFIX.length))
    if (secret.length < MIN_INVITE_SECRET_BYTES) throw new Error('Room invite secret is too short.')
    return { seed: secret, encoded: cleanInvite, highEntropy: true }
  }

  if (cleanInvite.length < 16) {
    throw new Error('Raw room invite must be at least 16 characters. Prefer `npm start -- create`.')
  }

  return {
    seed: createHash('sha256').update(`${TOPIC_CONTEXT}:raw:${cleanInvite}`).digest(),
    encoded: cleanInvite,
    highEntropy: false,
  }
}

function messageSigningBytes(envelope) {
  return Buffer.from(JSON.stringify({
    v: envelope.v,
    type: envelope.type,
    id: envelope.id,
    from: envelope.from,
    fromPublicKey: envelope.fromPublicKey,
    to: envelope.to,
    alg: envelope.alg,
    iv: envelope.iv,
    tag: envelope.tag,
    c: envelope.c,
    at: envelope.at,
  }))
}

function envelopeAad(envelope) {
  return Buffer.from(`osocial-peer-envelope:v1:${envelope.id}:${envelope.fromPublicKey}:${envelope.to || 'room'}`)
}

export function createRoomInvite() {
  return `${INVITE_PREFIX}${base64Url(randomBytes(MIN_INVITE_SECRET_BYTES))}`
}

export function createPeerIdentity(name = 'peer') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    name,
    publicKey,
    privateKey,
    publicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  }
}

export function deriveRoomSecrets(invite) {
  const { seed, encoded, highEntropy } = normalizeInvite(invite)
  const topic = createHash('sha256').update(TOPIC_CONTEXT).update(seed).digest()
  const messageKey = Buffer.from(hkdfSync('sha256', seed, Buffer.from(MESSAGE_CONTEXT), Buffer.from(INFO_CONTEXT), 32))
  const roomId = topic.toString('hex').slice(0, 16)

  return { topic, messageKey, roomId, invite: encoded, highEntropy }
}

export function encryptMessage({ plaintext, messageKey, identity, to = 'room' }) {
  const iv = randomBytes(12)
  const id = randomBytes(16).toString('hex')
  const at = new Date().toISOString()
  const iv64 = iv.toString('base64')
  const cipher = createCipheriv('aes-256-gcm', messageKey, iv)
  const baseEnvelope = {
    v: 1,
    type: 'message',
    id,
    from: identity.name,
    fromPublicKey: identity.publicKeyBase64,
    to,
    alg: 'AES-256-GCM+Ed25519',
    iv: iv64,
    at,
  }
  cipher.setAAD(envelopeAad(baseEnvelope))
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const envelope = {
    ...baseEnvelope,
    tag: tag.toString('base64'),
    c: ciphertext.toString('base64'),
    bytes: ciphertext.length + tag.length + iv.length,
  }
  const signature = sign(null, messageSigningBytes(envelope), identity.privateKey)

  return { ...envelope, sig: signature.toString('base64') }
}

export function decryptMessage(envelope, messageKey) {
  if (envelope?.v !== 1 || envelope?.type !== 'message') throw new Error('Unsupported message envelope.')

  const iv = Buffer.from(envelope.iv, 'base64')
  const tag = Buffer.from(envelope.tag, 'base64')
  const ciphertext = Buffer.from(envelope.c, 'base64')
  const signature = Buffer.from(envelope.sig, 'base64')
  const publicKeyDer = Buffer.from(envelope.fromPublicKey, 'base64')
  const publicKey = createPublicKey({ key: publicKeyDer, type: 'spki', format: 'der' })

  if (!verify(null, messageSigningBytes(envelope), publicKey, signature)) throw new Error('Message signature is invalid.')

  const decipher = createDecipheriv('aes-256-gcm', messageKey, iv)
  decipher.setAAD(envelopeAad(envelope))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export function createHello(identity, roomId) {
  return {
    v: 1,
    type: 'hello',
    name: identity.name,
    fromPublicKey: identity.publicKeyBase64,
    roomId,
    at: new Date().toISOString(),
  }
}
