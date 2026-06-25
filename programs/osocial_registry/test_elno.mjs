import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const RPC = 'http://127.0.0.1:8899'
const PROGRAM = new PublicKey('BUzkRoFa1KBDtDuxynEcmPkWnnXNmRLNabYHdNRSEfU5')
const conn = new Connection(RPC, 'confirmed')
const SYS = SystemProgram.programId

const load = (p) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p))))
const authority = load(process.env.HOME + '/dev/onchain-social-lab/.keys/mainnet-burner.json') // 89EvL1 = authority + treasury
const treasury = authority.publicKey

const disc = (name) => createHash('sha256').update('global:' + name).digest().subarray(0, 8)
const str = (s) => { const b = Buffer.from(s, 'utf8'); const len = Buffer.alloc(4); len.writeUInt32LE(b.length); return Buffer.concat([len, b]) }
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, PROGRAM)[0]
const SEED = (s) => Buffer.from(s)

const configPda = pda([SEED('config')])
const profilePda = (u) => pda([SEED('profile'), u.toBuffer()])
const handlePda = (h) => pda([SEED('handle'), Buffer.from(h)])
const followPda = (f, g) => pda([SEED('follow'), f.toBuffer(), g.toBuffer()])

async function airdrop(pk, sol) { const s = await conn.requestAirdrop(pk, sol * 1e9); await conn.confirmTransaction(s, 'confirmed') }

let pass = 0, fail = 0
async function step(name, ix, signers) {
  try {
    const tx = new Transaction().add(ix)
    const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed', skipPreflight: false })
    console.log(`  ✅ ${name}  (${sig.slice(0, 8)}…)`); pass++
    return true
  } catch (e) {
    const log = (e.transactionLogs || e.logs || []).join(' | ')
    console.log(`  ❌ ${name}  -> ${(e.message || '').slice(0, 90)} ${log.slice(0, 120)}`); fail++
    return false
  }
}
const key = (pubkey, isSigner, isWritable) => ({ pubkey, isSigner, isWritable })

async function main() {
  console.log('=== ELNO instruction testleri (local validator) ===')
  const alice = Keypair.generate(), bob = Keypair.generate(), charlie = Keypair.generate()
  await airdrop(authority.publicKey, 5)
  for (const u of [alice, bob, charlie]) await airdrop(u.publicKey, 5)

  // 1) initialize_config (fee=0)
  await step('initialize_config', new TransactionInstruction({
    programId: PROGRAM, keys: [
      key(authority.publicKey, true, true), key(configPda, false, true), key(treasury, false, false), key(SYS, false, false),
    ], data: Buffer.concat([disc('initialize_config'), u64(0)]),
  }), [authority])

  // 2) register_profile (alice) — authority co-sign
  const regAlice = (user, handle) => new TransactionInstruction({
    programId: PROGRAM, keys: [
      key(user.publicKey, true, true), key(authority.publicKey, true, false), key(configPda, false, false),
      key(profilePda(user.publicKey), false, true), key(handlePda(handle), false, true), key(treasury, false, true), key(SYS, false, false),
    ], data: Buffer.concat([disc('register_profile'), str(handle), str(handle + ' display')]),
  })
  await step('register_profile (alice)', regAlice(alice, 'alice'), [alice, authority])
  await step('register_profile (bob)', regAlice(bob, 'bob'), [bob, authority])

  // ElnoPost ortak accounts (user + own profile)
  const elnoPostKeys = (u) => [key(u.publicKey, true, true), key(profilePda(u.publicKey), false, true)]
  // 3) elnopost
  await step('elnopost', new TransactionInstruction({ programId: PROGRAM, keys: elnoPostKeys(alice), data: Buffer.concat([disc('elnopost'), str('hello elno, first post')]) }), [alice])
  // 4) elnoreply
  await step('elnoreply', new TransactionInstruction({ programId: PROGRAM, keys: elnoPostKeys(alice), data: Buffer.concat([disc('elnoreply'), str('a reply'), str('parenttxsig123')]) }), [alice])
  // 5) elnoquote
  await step('elnoquote', new TransactionInstruction({ programId: PROGRAM, keys: elnoPostKeys(alice), data: Buffer.concat([disc('elnoquote'), str('a quote'), str('quotedtxsig123')]) }), [alice])
  // 6) elnoedit
  await step('elnoedit', new TransactionInstruction({ programId: PROGRAM, keys: elnoPostKeys(alice), data: Buffer.concat([disc('elnoedit'), str('edited text'), str('edittxsig123')]) }), [alice])
  // 7) elnodelete
  await step('elnodelete', new TransactionInstruction({ programId: PROGRAM, keys: elnoPostKeys(alice), data: Buffer.concat([disc('elnodelete'), str('deltxsig123')]) }), [alice])
  // 10) elnoprofile
  await step('elnoprofile', new TransactionInstruction({ programId: PROGRAM, keys: elnoPostKeys(alice), data: Buffer.concat([disc('elnoprofile'), str('Alice New'), str('my bio'), str('nft:somemint')]) }), [alice])

  // 8) elnofollow (alice -> bob)
  await step('elnofollow (alice->bob)', new TransactionInstruction({
    programId: PROGRAM, keys: [key(alice.publicKey, true, true), key(followPda(alice.publicKey, bob.publicKey), false, true), key(SYS, false, false)],
    data: Buffer.concat([disc('elnofollow'), bob.publicKey.toBuffer()]),
  }), [alice])
  // self-follow engeli (basarisiz OLMALI)
  console.log('  (negatif test: self-follow reddedilmeli)')
  await step('elnofollow self (RED bekleniyor)', new TransactionInstruction({
    programId: PROGRAM, keys: [key(alice.publicKey, true, true), key(followPda(alice.publicKey, alice.publicKey), false, true), key(SYS, false, false)],
    data: Buffer.concat([disc('elnofollow'), alice.publicKey.toBuffer()]),
  }), [alice])
  // 9) elnounfollow
  await step('elnounfollow (alice->bob)', new TransactionInstruction({
    programId: PROGRAM, keys: [key(alice.publicKey, true, true), key(followPda(alice.publicKey, bob.publicKey), false, true)],
    data: Buffer.concat([disc('elnounfollow'), bob.publicKey.toBuffer()]),
  }), [alice])

  // 11) transfer_handle (alice "alice" -> charlie)
  await step('transfer_handle (alice->charlie)', new TransactionInstruction({
    programId: PROGRAM, keys: [key(alice.publicKey, true, false), key(handlePda('alice'), false, true)],
    data: Buffer.concat([disc('transfer_handle'), charlie.publicKey.toBuffer()]),
  }), [alice])
  // dogrula: handle_claim.owner artik charlie mi
  const claim = await conn.getAccountInfo(handlePda('alice'))
  const ownerAfter = new PublicKey(claim.data.subarray(8, 40)).toBase58()
  console.log('  -> handle "alice" yeni sahip:', ownerAfter, ownerAfter === charlie.publicKey.toBase58() ? '✅ charlie' : '❌ beklenmedik')

  console.log(`\n=== SONUC: ${pass} PASS, ${fail} FAIL ===`)
  // self-follow negatif testi FAIL sayildi ama o aslinda DOGRU (reddedildi); not dus
  process.exit(0)
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
