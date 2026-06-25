#!/usr/bin/env node
// elno — post directly to the Elno program on Solana, with your own key.
//
// No website, no Elno server, no middleman. You register a username once on the
// Elno site (the only authority-gated step), save your key, and from then on you
// write straight to the on-chain program from your own machine. Fully self-custodial,
// fully anonymous.
//
//   node cli/elno.mjs whoami
//   node cli/elno.mjs post "hello, on-chain world"
//   node cli/elno.mjs reply <parentTxSig> "nice post"
//   node cli/elno.mjs quote <parentTxSig> "look at this"
//   node cli/elno.mjs follow <wallet>
//   node cli/elno.mjs unfollow <wallet>
//
// Config (env vars):
//   ELNO_KEY         path to your key file, or the base58 key itself (default ./elno-key.txt)
//   ELNO_RPC         Solana RPC URL (default mainnet-beta public endpoint)
//   ELNO_PROGRAM_ID  override the program id (default = Elno mainnet)

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import bs58 from 'bs58'

const PROGRAM = new PublicKey(process.env.ELNO_PROGRAM_ID || 'EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX')
const RPC = process.env.ELNO_RPC || 'https://api.mainnet-beta.solana.com'
const KEY_PATH = process.env.ELNO_KEY || './elno-key.txt'
const SYS = SystemProgram.programId

// --- encoding helpers (Anchor: discriminator = sha256("global:"+name)[:8]) ---
const disc = (name) => createHash('sha256').update('global:' + name).digest().subarray(0, 8)
const encStr = (s) => {
  const b = Buffer.from(s, 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(b.length)
  return Buffer.concat([len, b])
}
const acc = (pubkey, isSigner, isWritable) => ({ pubkey, isSigner, isWritable })

// Readable, self-contained packet. The indexer decodes the `osocial:v0:json:` prefix.
const packet = (text) => `osocial:v0:json:${JSON.stringify({ v: 0, type: 'post', t: text, m: [] })}`

const profilePda = (user) => PublicKey.findProgramAddressSync([Buffer.from('profile'), user.toBuffer()], PROGRAM)[0]
const followPda = (follower, following) =>
  PublicKey.findProgramAddressSync([Buffer.from('follow'), follower.toBuffer(), following.toBuffer()], PROGRAM)[0]

function loadKeypair(pathOrKey) {
  let raw = pathOrKey
  try {
    raw = readFileSync(pathOrKey, 'utf8').trim()
  } catch {
    /* not a file — treat the value itself as the key */
  }
  if (raw.startsWith('[')) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)))
  return Keypair.fromSecretKey(bs58.decode(raw))
}

const HELP = `elno — post directly to the Elno program on Solana, with your own key.

  node cli/elno.mjs whoami
  node cli/elno.mjs post "your text"
  node cli/elno.mjs reply <parentTxSig> "your reply"
  node cli/elno.mjs quote <parentTxSig> "your comment"
  node cli/elno.mjs follow <wallet>
  node cli/elno.mjs unfollow <wallet>

Env: ELNO_KEY (key file or base58, default ./elno-key.txt) · ELNO_RPC · ELNO_PROGRAM_ID

Register a username once on the Elno site, save the key it gives you, then post from here.
No site or server is involved in posting — only you and the chain.`

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    console.log(HELP)
    return
  }

  const conn = new Connection(RPC, 'confirmed')
  const kp = loadKeypair(KEY_PATH)
  const me = kp.publicKey
  const prof = profilePda(me)

  if (cmd === 'whoami') {
    const info = await conn.getAccountInfo(prof)
    console.log('wallet :', me.toBase58())
    console.log('profile:', prof.toBase58(), info ? '✓ registered' : '✗ not registered — claim a username on the Elno site first')
    return
  }

  let ix
  if (cmd === 'post' || cmd === 'reply' || cmd === 'quote') {
    const info = await conn.getAccountInfo(prof)
    if (!info) throw new Error('No profile for this key. Claim a username once on the Elno site, then use that key here.')

    if (cmd === 'post') {
      const text = args.join(' ')
      if (!text) throw new Error('usage: post "your text"')
      ix = new TransactionInstruction({
        programId: PROGRAM,
        keys: [acc(me, true, true), acc(prof, false, true)],
        data: Buffer.concat([disc('elnopost'), encStr(packet(text))]),
      })
    } else {
      const [parent, ...rest] = args
      const text = rest.join(' ')
      if (!parent || !text) throw new Error(`usage: ${cmd} <parentTxSig> "your text"`)
      ix = new TransactionInstruction({
        programId: PROGRAM,
        keys: [acc(me, true, true), acc(prof, false, true)],
        data: Buffer.concat([disc(cmd === 'reply' ? 'elnoreply' : 'elnoquote'), encStr(packet(text)), encStr(parent)]),
      })
    }
  } else if (cmd === 'follow' || cmd === 'unfollow') {
    if (!args[0]) throw new Error(`usage: ${cmd} <wallet>`)
    const target = new PublicKey(args[0])
    const fpda = followPda(me, target)
    ix =
      cmd === 'follow'
        ? new TransactionInstruction({
            programId: PROGRAM,
            keys: [acc(me, true, true), acc(fpda, false, true), acc(SYS, false, false)],
            data: Buffer.concat([disc('elnofollow'), target.toBuffer()]),
          })
        : new TransactionInstruction({
            programId: PROGRAM,
            keys: [acc(me, true, true), acc(fpda, false, true)],
            data: Buffer.concat([disc('elnounfollow'), target.toBuffer()]),
          })
  } else {
    console.log(HELP)
    return
  }

  const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [kp], { commitment: 'confirmed' })
  console.log('✓ on-chain:', sig)
  console.log('  https://solscan.io/tx/' + sig)
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
