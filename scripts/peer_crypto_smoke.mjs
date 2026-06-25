import { webcrypto } from 'node:crypto'

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  })
}

const {
  createPeerInvite,
  decryptPeerText,
  encryptPeerText,
  generatePeerIdentity,
} = await import('../src/peerCrypto.js')

const alice = await generatePeerIdentity({ label: 'Alice', wallet: 'alice-wallet', handle: '@alice' })
const bob = await generatePeerIdentity({ label: 'Bob', wallet: 'bob-wallet', handle: '@bob' })
const invite = await createPeerInvite({ roomId: 'smoke-room', owner: alice })
const envelope = await encryptPeerText({
  sender: alice,
  recipient: bob,
  text: 'hello peer',
  roomId: invite.roomId,
})
const opened = await decryptPeerText({
  recipient: bob,
  senderPublicJwk: alice.publicJwk,
  envelope,
})

if (opened.text !== 'hello peer') {
  throw new Error('Peer crypto smoke failed.')
}

console.log(JSON.stringify({
  ok: true,
  roomId: invite.roomId,
  topic: invite.topic,
  bytes: Buffer.byteLength(JSON.stringify(envelope), 'utf8'),
  alg: envelope.alg,
}))
