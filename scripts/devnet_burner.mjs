import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction
} from "@solana/web3.js";

const KEYPAIR_PATH = new URL("../.keys/devnet-burner.json", import.meta.url);
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const keypairPath = fileURLToPath(KEYPAIR_PATH);

async function loadOrCreateKeypair() {
  await mkdir(new URL("../.keys/", import.meta.url), { recursive: true });

  if (existsSync(KEYPAIR_PATH)) {
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

async function confirm(signature) {
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    },
    "confirmed"
  );
}

const wallet = await loadOrCreateKeypair();
const address = wallet.publicKey.toBase58();

console.log(`devnet burner public address: ${address}`);
console.log(`keypair file: ${keypairPath}`);

let balance = await connection.getBalance(wallet.publicKey, "confirmed");
console.log(`balance before: ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

if (balance < 0.05 * LAMPORTS_PER_SOL) {
  let sig = null;

  for (const sol of [1, 0.5, 0.1]) {
    try {
      console.log(`requesting devnet airdrop: ${sol} SOL`);
      sig = await connection.requestAirdrop(
        wallet.publicKey,
        Math.floor(sol * LAMPORTS_PER_SOL)
      );
      await confirm(sig);
      console.log(`airdrop signature: ${sig}`);
      break;
    } catch (error) {
      console.log(`airdrop failed for ${sol} SOL: ${error.message}`);
    }
  }

  balance = await connection.getBalance(wallet.publicKey, "confirmed");
  console.log(`balance after airdrop: ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  if (!sig || balance === 0) {
    console.log("no devnet SOL available from the public RPC faucet right now");
    console.log(`fund this address from a devnet faucet, then run: npm run devnet`);
    process.exit(0);
  }
}

const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: wallet.publicKey,
    lamports: 1
  })
);

const signature = await connection.sendTransaction(tx, [wallet], {
  skipPreflight: false,
  preflightCommitment: "confirmed"
});
await confirm(signature);

balance = await connection.getBalance(wallet.publicKey, "confirmed");
console.log(`self-transfer signature: ${signature}`);
console.log(`balance after tx: ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
