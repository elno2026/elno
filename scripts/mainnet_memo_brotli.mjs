import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const KEYPAIR_PATH = new URL("../.keys/mainnet-burner.json", import.meta.url);
const keypairPath = fileURLToPath(KEYPAIR_PATH);
const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

const SAMPLE_TEXT = `
On-chain social media test: this post is compressed with Brotli, base64url encoded,
and submitted to Solana mainnet-beta through the Memo Program as a real transaction.
`.trim();

async function loadOrCreateKeypair() {
  await mkdir(new URL("../.keys/", import.meta.url), { recursive: true });

  if (existsSync(keypairPath)) {
    const raw = JSON.parse(await readFile(keypairPath, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }

  const keypair = Keypair.generate();
  await writeFile(
    keypairPath,
    JSON.stringify(Array.from(keypair.secretKey)),
    { mode: 0o600 }
  );
  return keypair;
}

async function readStdinIfAny() {
  if (process.stdin.isTTY) return "";

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function base64url(buffer) {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function compressText(text) {
  const raw = Buffer.from(text, "utf8");
  const compressed = brotliCompressSync(raw, {
    params: {
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      [constants.BROTLI_PARAM_QUALITY]: 11
    }
  });
  return { raw, compressed };
}

const wallet = await loadOrCreateKeypair();
const address = wallet.publicKey.toBase58();
const stdin = await readStdinIfAny();
const text = stdin || SAMPLE_TEXT;
const { raw, compressed } = compressText(text);
const encoded = base64url(compressed);
const memo = `osocial:v0:br:${encoded}`;

console.log(`mainnet burner public address: ${address}`);
console.log(`keypair file: ${keypairPath}`);
console.log(`raw utf8 bytes: ${raw.length}`);
console.log(`brotli bytes: ${compressed.length}`);
console.log(`memo utf8 bytes: ${Buffer.byteLength(memo, "utf8")}`);

const latest = await connection.getLatestBlockhash("confirmed");
const tx = new Transaction({
  feePayer: wallet.publicKey,
  blockhash: latest.blockhash,
  lastValidBlockHeight: latest.lastValidBlockHeight
}).add(
  new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memo, "utf8")
  })
);

tx.sign(wallet);
const txBytes = tx.serialize({ verifySignatures: true }).length;
console.log(`serialized tx bytes: ${txBytes}`);

if (txBytes > 1232) {
  console.log("transaction is too large for Solana's 1232-byte packet limit");
  process.exit(1);
}

const feeResult = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
const feeLamports = feeResult.value ?? 5000;
const balance = await connection.getBalance(wallet.publicKey, "confirmed");
console.log(`balance: ${(balance / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
console.log(`estimated fee: ${(feeLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL`);

if (balance < feeLamports) {
  console.log("not enough SOL to send a real mainnet transaction yet");
  console.log(`send a tiny amount, e.g. 0.001 SOL, to: ${address}`);
  console.log(`then run: npm run mainnet:memo`);
  process.exit(0);
}

const signature = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,
  preflightCommitment: "confirmed"
});

await connection.confirmTransaction(
  {
    signature,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight
  },
  "confirmed"
);

console.log(`mainnet tx signature: ${signature}`);
console.log(`explorer: https://explorer.solana.com/tx/${signature}`);
