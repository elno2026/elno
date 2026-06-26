# Elno

**A social network where every post is a Solana transaction you own.**

No company server holds your feed. No moderator can quietly delete you. You write, you sign with your own key, and the post lands on-chain as an event from an Anchor program — public, verifiable, permanent, and readable from any explorer or indexer.

I built Elno because I was tired of "your" account being something a platform lends you and can take back. On Elno there is no account to suspend. There is a key, and the key is yours.

---

## The core idea

A post on Elno is not a row in someone's database. It's an instruction to an on-chain program — `elnopost` — that emits an event onto Solana mainnet. Replies (`elnoreply`) and quotes (`elnoquote`) point at a parent transaction. Edits and deletes are themselves events the indexer interprets; the original never disappears, because nothing on a public chain ever truly does. Ownership is settled by cryptography, not by a terms-of-service page.

That single decision — *the post is the transaction* — gives you everything below for free.

## What that buys you

- **Anonymous by default.** No email, no phone, no KYC. Your private key is your identity and your login. That's it.
- **Censorship-proof.** No platform can edit, hide, shadowban, or delete what you publish. It lives on-chain, signed by you.
- **Self-custody.** The app generates a wallet in your browser and encrypts it locally — AES-GCM, a non-extractable key, stored in IndexedDB. The private key **never leaves your device** and is **never sent to any server**. Paste it to log in from another device, or import it into Phantom or Solflare.
- **Permissionless.** The instructions are open. You can post straight to the program from your own machine without ever touching this website. Only your wallet can post as you.
- **Cheap.** A post is an event, not a stored account — roughly 5000 lamports, a fraction of a cent. Usernames are free right now; you pay a one-time account rent of ~0.004 SOL (about half a cent) plus the network fee.
- **Deliberately calm.** Only **Reply** and **Quote** exist. No likes, no reposts, no save button, no vanity counters, no engagement algorithm deciding what you see. Text-only today. The quiet is the point.

## Status

### Works today (live on Solana mainnet)

- Text posts, replies, and quotes
- Edit and delete (as supersede / tombstone events)
- Follow / unfollow
- On-chain profile — display name, bio, avatar
- Username registration with on-chain uniqueness
- Username transfer between wallets
- Self-custody key login (generate in-browser, or paste a key)
- IDL published on-chain, so explorers decode the instructions

### Coming soon (planned — not done yet)

- A public indexer and a real timeline feed that reads on-chain events
- Images and video — content-addressed media with on-chain references
- NFT profile photos wired into the UI
- Private messaging — peer-to-peer, end-to-end encrypted DMs
- Mobile apps
- Multiple independent indexers and third-party clients on the same program (client diversity)
- Social / recovery options
- Open-source release on GitHub

No token exists, and I'm not planning one. If anyone tells you otherwise, they're lying.

---

## Run it locally

You need Node 20.6+ (for `--env-file`) and a Solana RPC URL. Helius works well; the public endpoint works for light testing.

**1. Install**

```bash
npm install
```

**2. Configure**

```bash
cp .env.example .env
```

Open `.env` and set at least:

- `VITE_MAINNET_RPC_URL` — RPC the frontend reads from
- `VITE_OSOCIAL_SIGNER_URL` — where the signer is reachable (default local: `https://127.0.0.1:8787`)
- `MAINNET_RPC_URL` — RPC the signer uses
- `OSOCIAL_AUTHORITY_KEYPAIR` — path to the authority keypair (only needed to co-sign username registration)

**3. Start the stateless signer**

```bash
node --env-file=.env server/mainnet-signer.mjs
```

It builds unsigned transactions, co-signs username registration, and proxies RPC reads. It never receives or stores your private key — listens on `127.0.0.1:8787` by default. (`npm run signer` works too if your environment is already loaded.)

**4. Start the frontend**

```bash
npm run dev
```

Open the printed Vite URL. The app generates a device wallet, you fund it with a little SOL, and you post. Every transaction is signed in your browser before it leaves.

> The website is just one client. The program is the network. You can write your own client against the same program ID and it's just as "real" as this one.

## Post without the website

You register a username **once** on the site (the only authority-gated step), save your key, and from then on you write straight to the program from your own machine — no site, no signer, no middleman. There's a tiny CLI for exactly this:

```bash
echo 'YOUR_BASE58_PRIVATE_KEY' > elno-key.txt   # the key the site gave you
export ELNO_RPC='https://your-own-rpc'

node cli/elno.mjs post "first post, signed by my own key, sent by me"
node cli/elno.mjs reply <parentTxSig> "good point"
node cli/elno.mjs follow <wallet>
```

`elnopost`, `elnoreply`, `elnoquote`, `elnoedit`, `elnodelete`, `elnofollow`, `elnounfollow`, `elnoprofile` are all permissionless — they need nobody's signature but yours. Full guide: **[docs/SELF-HOST](docs/SELF-HOST.md)**.

---

## Architecture

Three layers, deliberately thin in the middle.

| Layer | What it is | What it can do | What it can't do |
| --- | --- | --- | --- |
| **Frontend** | Vite + React | Holds the device wallet, builds packets, signs every tx locally | Nothing without your key |
| **Signer** | Small stateless Node backend | Builds unsigned txs, co-signs username registration, proxies RPC | Touch your private key, post for you, edit or delete your content |
| **Program** | Anchor / Rust registry on mainnet | Emits events, enforces username uniqueness on-chain | Be changed by anyone but the upgrade authority |

The signer is co-signer for exactly one thing — claiming a username — and it sets fees. It cannot impersonate you, because it never holds your key. RPC reads go through Helius.

One honest caveat: the platform authority can also freeze a profile from publishing *new* posts (`set_profile_status` flips an `active` flag). It still cannot edit, delete, or alter anything you've already published, and it can never post in your name. Loosening and decentralizing that gate is on the roadmap — I'd rather tell you it exists than pretend it doesn't.

Deeper detail in [docs/ARCHITECTURE](docs/ARCHITECTURE.md) and [docs/PROGRAM](docs/PROGRAM.md).

## The program

Live on Solana **mainnet**, Anchor / Rust, upgradeable, IDL published on-chain (explorers decode the instruction names for you) and committed to this repo at [`idl/elno.json`](idl/elno.json) so you can build a client in minutes.

```
Program ID:  EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX
```

**Instructions** (the `elno` prefix is intentional branding):

`register_profile` · `elnopost` · `elnoreply` · `elnoquote` · `elnoedit` · `elnodelete` · `elnofollow` · `elnounfollow` · `elnoprofile` · `elnopfp` · `transfer_handle`
Admin: `initialize_config` · `set_authority` · `set_treasury` · `set_registration_fee` · `set_profile_status`

**Accounts:** `Config`, `Profile`, `HandleClaim` (on-chain username uniqueness), `Follow`

**PDAs:**

```
config        = ["config"]
profile       = ["profile", owner]
handle_claim  = ["handle", handle]
follow        = ["follow", follower, following]
```

Edit and delete are events, not erasures — the indexer reconstructs current state, and ownership is verified cryptographically against the signer of each event.

## Tech stack

- **Frontend:** Vite + React, `@solana/web3.js`, client-side AES-GCM key encryption in IndexedDB
- **Signer:** Node (stateless `http`/`https`, no framework, no database)
- **Program:** Anchor / Rust on Solana mainnet
- **RPC:** Helius

---

## Docs

- [docs/MANIFESTO](docs/MANIFESTO.md) — why this exists
- [docs/SELF-HOST](docs/SELF-HOST.md) — run your own / post anonymously straight to the chain
- [docs/ARCHITECTURE](docs/ARCHITECTURE.md) — how the three layers fit together
- [docs/PROGRAM](docs/PROGRAM.md) — instructions, accounts, PDAs, events
- [docs/ROADMAP](docs/ROADMAP.md) — what's done and what's planned
- [docs/FAQ](docs/FAQ.md) — the questions everyone asks

## Contributing

Client diversity is a goal, not a slogan — the best thing you can build is *another* client or indexer against the same program. Open an issue or PR. The protocol is permissionless; please don't break that property in anything you send.

## License

Open-source release is planned. Until the license file lands, treat the code as source-available — read it, learn from it, run it locally. Ask before redistributing.

---

*I keep my name off this on purpose. A network built for anonymity should be able to survive its founder walking away. The program is on mainnet; the key is in your browser; the rest is up to you.*

— Elno
