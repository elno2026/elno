#!/usr/bin/env node

import process from 'node:process'
import readline from 'node:readline'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import { createHello, createPeerIdentity, createRoomInvite, decryptMessage, deriveRoomSecrets, encryptMessage } from './crypto.mjs'

const args = parseArgs(process.argv.slice(2))
const command = args._[0] || (args.invite || args.room || process.env.OSOCIAL_PEER_INVITE ? 'join' : 'help')
const invite = args.invite || args.room || args._[1] || process.env.OSOCIAL_PEER_INVITE
const name = args.name || process.env.OSOCIAL_PEER_NAME || `peer-${Math.random().toString(16).slice(2, 6)}`

if (command === 'create') {
  console.log(createRoomInvite())
  process.exit(0)
}

if (command !== 'join' || !invite) {
  printUsage()
  process.exit(1)
}

const identity = createPeerIdentity(name)
const { topic, messageKey, roomId, highEntropy } = deriveRoomSecrets(invite)
const swarm = new Hyperswarm()
const peers = new Set()
const seenMessages = new Set()

console.log(`[osocial-peer] name=${name}`)
console.log(`[osocial-peer] room=${roomId}`)
console.log(`[osocial-peer] topic=${topic.toString('hex')}`)
console.log(`[osocial-peer] invite=${highEntropy ? 'high-entropy' : 'raw-passphrase, use create for production tests'}`)
console.log('[osocial-peer] type a message and press enter. messages are encrypted before writing to peer sockets.')

swarm.on('connection', (socket, details) => {
  const remoteKey = details.publicKey ? b4a.toString(details.publicKey, 'hex').slice(0, 16) : 'unknown'
  peers.add(socket)
  console.log(`[osocial-peer] connected ${remoteKey}; peers=${peers.size}`)

  socket.write(`${JSON.stringify(createHello(identity, roomId))}\n`)

  let buffer = ''
  socket.on('data', (chunk) => {
    buffer += b4a.toString(chunk)
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) handleLine(line)
  })

  socket.on('close', () => {
    peers.delete(socket)
    console.log(`[osocial-peer] disconnected ${remoteKey}; peers=${peers.size}`)
  })

  socket.on('error', (error) => {
    peers.delete(socket)
    console.error(`[osocial-peer] connection error: ${error.message}`)
  })
})

const discovery = swarm.join(topic, { client: true, server: true })
await discovery.flushed()
console.log('[osocial-peer] announced to DHT. start a second terminal with the same invite.')

const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
input.setPrompt('> ')
input.prompt()
input.on('line', (line) => {
  const text = line.trim()
  if (!text) {
    input.prompt()
    return
  }

  const envelope = encryptMessage({ plaintext: text, messageKey, identity })
  seenMessages.add(envelope.id)
  broadcast(envelope)
  console.log(`[me] ${text}`)
  input.prompt()
})

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

function handleLine(line) {
  if (!line.trim()) return
  let envelope
  try {
    envelope = JSON.parse(line)
  } catch {
    console.error('[osocial-peer] ignored non-json frame')
    return
  }

  if (envelope.type === 'hello') {
    console.log(`[osocial-peer] hello from ${envelope.name || 'peer'}`)
    return
  }

  if (envelope.type !== 'message' || seenMessages.has(envelope.id)) return
  seenMessages.add(envelope.id)

  try {
    const plaintext = decryptMessage(envelope, messageKey)
    console.log(`\n[${envelope.from || 'peer'}] ${plaintext}`)
    input.prompt()
  } catch (error) {
    console.error(`[osocial-peer] could not decrypt message: ${error.message}`)
  }
}

function broadcast(envelope) {
  const frame = `${JSON.stringify(envelope)}\n`
  for (const peer of peers) {
    if (!peer.destroyed) peer.write(frame)
  }
}

async function shutdown() {
  input.close()
  await swarm.destroy()
  process.exit(0)
}

function parseArgs(values) {
  const out = { _: [] }
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (!value.startsWith('--')) {
      out._.push(value)
      continue
    }
    const key = value.slice(2)
    const next = values[i + 1]
    out[key] = next && !next.startsWith('--') ? next : 'true'
    if (next && !next.startsWith('--')) i += 1
  }
  return out
}

function printUsage() {
  console.error('Usage:')
  console.error('  npm start -- create')
  console.error('  npm start -- join --invite <osocial-peer:v1:...> --name alice')
  console.error('')
  console.error('Two-terminal smoke test:')
  console.error('  INVITE=$(npm start --silent -- create)')
  console.error('  OSOCIAL_PEER_INVITE=$INVITE npm start -- join --name alice')
  console.error('  OSOCIAL_PEER_INVITE=$INVITE npm start -- join --name bob')
}
