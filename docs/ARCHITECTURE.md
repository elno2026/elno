# Elno Architecture

I built Elno because I was tired of social networks that own you. They own your account, your reach, your posts, the right to delete you on a Tuesday for reasons they'll never explain. So Elno doesn't store your feed on a server I control. It puts every post on Solana as a transaction, signed by a key that lives only on your device. No company server owns your identity. No moderator can reach into your history and rewrite it. The network is the source of truth.

This document is the honest, technical version of how that works — the three layers, the wallet model, why posts are events and not accounts, and the precise threat model: what each piece *can* do, and what it *cannot*.

## Program ID

The Anchor program is live on Solana **mainnet**:

```
EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX
```

The IDL is published **on-chain**. Block explorers decode the instruction names directly — you don't have to take my word for what the program does, you can read it.

## The three layers

Elno is three layers, and the trust boundaries between them are the whole point.

```
┌─────────────────────────────────────────────────────────────┐
│  1. FRONTEND  (Vite + React, runs in YOUR browser)           │
│     - generates & holds the device wallet                    │
│     - encrypts the key locally (AES-GCM, IndexedDB)          │
│     - builds packets, SIGNS every transaction with your key  │
│     - the key never leaves this layer                        │
└───────────────────────────┬─────────────────────────────────┘
                            │  unsigned tx requests / signed tx
                            │  RPC reads (proxied)
┌───────────────────────────┴─────────────────────────────────┐
│  2. SIGNER  (small, stateless backend — anyone can run it)   │
│     - builds UNSIGNED transactions                           │
│     - co-signs ONLY username registration (authority step)   │
│     - proxies RPC reads (Helius)                             │
│     - never receives, never stores your private key          │
└───────────────────────────┬─────────────────────────────────┘
                            │  submit signed tx / read state
┌───────────────────────────┴─────────────────────────────────┐
│  3. PROGRAM  (Anchor / Rust, on Solana mainnet)              │
│     - the social registry: posts, replies, quotes, follows   │
│     - enforces username uniqueness on-chain                  │
│     - emits events that indexers read                        │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1 — Frontend (Vite + React)

This runs entirely in your browser. It is where your identity lives.

**It does:**
- Generate your wallet locally (client-side keygen — a fresh Ed25519 keypair).
- Encrypt the private key at rest with AES-GCM and store the ciphertext in IndexedDB.
- Build the transaction payload for whatever you're doing — a post, a reply, a follow.
- **Sign every transaction locally** with your key, in the browser, before anything leaves your machine.

**It does NOT:**
- Send your private key anywhere. Ever. Not to the signer, not to an analytics endpoint, not to me.
- Trust the signer to act as you. The signer hands back *unsigned* transactions; your browser is the only thing that applies your signature.

### Layer 2 — Signer (stateless backend)

The signer is a small backend that exists for convenience and for the one step that genuinely requires a co-signature. It is **stateless** — it holds no per-user data, no sessions, no keys belonging to you.

**It does:**
- Build unsigned transactions on request (assemble instructions, recent blockhash, fee payer wiring) so the frontend has less Solana plumbing to do.
- **Co-sign username registration.** Claiming a username (`register_profile`) is co-signed by the platform authority — this is the single authority-gated instruction. It's how I keep the namespace sane and gate handle issuance against spam.
- Proxy RPC reads through Helius so the frontend gets a clean read path.

**It does NOT:**
- Receive, see, or store your private key.
- Sign your posts, replies, quotes, edits, deletes, or follows. None of those need the authority. They are signed by you, on your device, and submitted as you.
- Own anything. **Anyone can run their own signer.** The website is just one client pointed at the program. The program is the network; the signer is replaceable infrastructure.

### Layer 3 — Program (Anchor / Rust)

The on-chain registry. It defines the instructions, the accounts, and the events. It's upgradeable today (I'm still shipping), but everything it does is open and decodable via the published IDL.

**On-chain instructions** (the `elno` prefix is intentional branding):

| Instruction | What it does |
|---|---|
| `register_profile` | Claim a unique username. Co-signed by the platform authority. Free now — you pay only account rent. |
| `elnopost` | Publish a post. |
| `elnoreply` | Reply to a parent transaction (`reply_to`). |
| `elnoquote` | Quote a parent transaction (`quote_of`). |
| `elnoedit` | Supersede a previous post (`edit_of`). Does **not** bump your post count. |
| `elnodelete` | Tombstone a post. |
| `elnofollow` / `elnounfollow` | Create / remove a Follow PDA. |
| `elnoprofile` | Update display name + bio + avatar — emitted as an event so it never corrupts existing profile accounts. |
| `elnopfp` | Set an NFT as your profile photo. The NFT stays in your main/recovery wallet, not the device wallet. |
| `transfer_handle` | Hand a username to another wallet. |
| `initialize_config`, `set_authority`, `set_treasury`, `set_registration_fee`, `set_profile_status` | Admin only. `set_profile_status` lets the authority disable a profile's gated posting (see the threat model below). |

**Accounts:** `Config`, `Profile`, `HandleClaim` (enforces username uniqueness on-chain), `Follow`.

**PDAs:**

```
config       = ["config"]
profile      = ["profile", owner]
handle_claim = ["handle", handle]
follow       = ["follow", follower, following]
```

**Events:** `ProfileRegistered` / `UsernameClaimed`, post/reply/quote/edit/delete created, `FollowCreated` / `FollowRemoved`, `ProfileMetaUpdated`, `PfpSet`, `HandleTransferred`.

## The device-wallet model

Your key *is* your identity and your login. There is no email, no phone, no password reset, no "sign in with Google". This is deliberate — anonymity is a feature, not a gap.

**How the key lives on your device:**

1. **Client-side keygen.** When you first open Elno, the browser generates a brand-new Ed25519 keypair. This happens locally. No server is involved in creating it, so no server ever sees it.
2. **AES-GCM encryption at rest.** The private key is encrypted with AES-GCM. The encryption key is **non-extractable** — held by the browser's WebCrypto subsystem, not exportable into JavaScript — so even the page's own code can't lift the raw crypto key out.
3. **IndexedDB storage.** The encrypted blob lives in IndexedDB on your device. What's persisted is ciphertext, not a usable key.
4. **Key = login.** To log in on another device, you paste your private key (base58). To leave, you can import that same key into Phantom or Solflare — it's a normal Solana keypair, nothing proprietary.

```
first visit ──► generate Ed25519 keypair (in browser)
                       │
                       ▼
            encrypt private key with AES-GCM
            (non-extractable WebCrypto key)
                       │
                       ▼
            store ciphertext in IndexedDB
                       │
   ┌───────────────────┴───────────────────┐
   ▼                                        ▼
sign txs locally                  export base58 key →
(key never leaves device)         log in elsewhere / import to Phantom
```

A practical note: the **device wallet** is the hot key that posts. Your **NFT profile photo** stays in your main or recovery wallet — `elnopfp` references an NFT you hold elsewhere, so a compromised device wallet never holds your valuable NFTs.

## Why posts are events, not accounts

This is the design decision that makes Elno cheap and readable.

On Solana, you can store data two ways: allocate an **account** (you pay rent for storage that persists), or emit an **event** inside a transaction (the data lives in the transaction log / the ledger, not in a rent-paying account).

Elno posts are **events**. A post is `elnopost` emitting an event — not a new account per post.

**Why it matters:**

- **Cost.** A post costs roughly **5000 lamports** — a fraction of a cent — because you're paying a network fee, not rent on a stored account. If every post were an account, you'd pay storage rent on every single one. That's the difference between a network you can actually use and one you can't afford to talk on.
- **Permanence.** The event is written to the ledger. It's on-chain, public, verifiable, and permanent. Any explorer or indexer can read it.
- **Indexability.** Events are exactly what indexers subscribe to. The published IDL means the event names and fields decode cleanly. A timeline is just an indexer replaying these events in order.
- **Edits and deletes are honest.** `elnoedit` emits a supersede event (`edit_of`) and `elnodelete` emits a tombstone. **The original event stays on-chain forever** — nothing is truly erased. An indexer interprets edits and deletes and verifies ownership before applying them. So "delete" means "the indexer hides it on your instruction," not "the bytes vanished." I'd rather be precise about that than pretend on-chain data can be unwritten.

What about the few things that *are* accounts? Uniqueness and relationships need persistent on-chain state, so `Profile`, `HandleClaim`, and `Follow` are accounts (PDAs). That's the small fixed cost — about 0.004 SOL of rent for the `Profile` + `HandleClaim` pair at registration — you pay once, not per post.

## Permissionless posting

Because the social instructions are open and decoded by the on-chain IDL, **you do not need the website to post**. You can build an `elnopost` transaction on your own machine, sign it with your key, and send it straight to the program. The signer isn't in that path — only `register_profile` needs a co-signature.

The guarantee that holds regardless of client: **only your own wallet can post as you.** A transaction "from you" is one signed by your key. No signer, no server, no second client can forge that. Run the website, run a script, run someone else's client — the program treats them identically, because the program only checks signatures.

## Username uniqueness via HandleClaim PDA

Usernames are unique at the protocol level — not because a database enforces it, but because Solana's account model does.

The PDA for a handle is derived as:

```
handle_claim = ["handle", handle]
```

That seed is deterministic: a given handle maps to exactly one PDA address. `register_profile` **creates** that `HandleClaim` account. Solana will not let you create an account that already exists — so the second person to try to claim the same handle fails at the chain level. There is no race condition I have to police in application code; the runtime guarantees it.

`register_profile` is co-signed by the platform authority (handle spam control), and `transfer_handle` lets you hand a username to another wallet while keeping the same `HandleClaim` — the claim moves, the name stays unique.

## Security & threat model

The single most important property: **your private key lives only in your browser.** Everything below follows from that.

### What the signer can do
- Build unsigned transactions.
- Co-sign **new username registrations** (the authority step).
- Set fees and treasury via admin instructions.
- Proxy RPC reads.

### What the signer / platform authority CANNOT do
- **Post, reply, quote, edit, or delete as you.** Those require *your* signature, which it never has.
- **Read or steal your key.** It never receives it. There's nothing to leak.
- **Impersonate you.** It cannot produce a valid signature for your wallet.
- **Censor your existing content.** Tombstones are honored by indexers on *your* instruction; the program authority can't tombstone your posts, and the original events remain on-chain regardless.
- **Lock you in.** Anyone can run a signer; anyone can post directly to the program; your key imports into any standard Solana wallet.

**The one thing it *can* do (and I won't hide it):** via `set_profile_status`, the platform authority can flip a profile's `active` flag and stop it from publishing *new* gated posts. It cannot alter or remove anything already on-chain, and it cannot post as you — but it can freeze a profile going forward. Today that authority is a single key I hold; removing this gate or decentralizing it is on the roadmap. A protocol that wants to be censorship-resistant has to be honest about where it isn't yet.

### What an attacker can / cannot do

**Cannot:**
- Forge posts from your wallet without your private key.
- Recover your key from the signer or any Elno server — it isn't there.
- Pull the raw AES key out of the page: the WebCrypto encryption key is non-extractable.

**Can (be honest about the real attack surface):**
- If an attacker **gets your private key** — you paste it on a phishing page, malware reads your clipboard, you back it up somewhere careless — they *are* you. Self-custody means no reset button. Guard the key like the bearer credential it is.
- If your **device is compromised**, code running on it could prompt you to sign things or capture a pasted key. Same as any self-custodial wallet. (This is why your NFTs live in a separate recovery wallet, and why social/recovery options are on the roadmap.)
- Anyone can **read everything** — posts are public on-chain by design. Privacy of *content* isn't a property today; private, end-to-end encrypted DMs are planned, separate work.

The trade is deliberate: I removed the platform's power over you, and in exchange you hold the responsibility that comes with a key. That's the deal of real ownership.

## Data flow: publishing a post

```
  YOU type a post in the browser
        │
        ▼
  [Frontend]  build the elnopost instruction + payload
        │
        ▼
  [Frontend]  request an unsigned tx (or assemble it locally)
        │                                   │
        │  ── via Signer (convenience) ──►  │  Signer builds unsigned tx,
        │                                   │  attaches recent blockhash.
        │  ◄──────── unsigned tx ───────────┘  NO signing of your post here.
        ▼
  [Frontend]  SIGN the tx locally with your device key
              (key stays in the browser — AES-GCM at rest,
               decrypted only in-memory to sign)
        │
        ▼
  [Frontend]  submit signed tx to Solana (RPC via Helius)
        │
        ▼
  [Program]   elnopost runs, emits a "post created" EVENT
              (~5000 lamports, no per-post account)
        │
        ▼
  [Ledger]    event is permanent, public, decodable via on-chain IDL
        │
        ▼
  [Indexer]   reads the event → it appears in feeds
              (real public timeline indexer = planned)
```

You'll notice the signer is optional in that path and never touches your signature. That's not an accident — it's the architecture.

## What's live vs. planned

I won't oversell this. Here's the honest state.

**Live on mainnet today:** text posts, reply, quote, edit, delete, follow / unfollow, on-chain profile, username transfer, self-custody key login, on-chain IDL. Working end to end.

**Planned (not done yet):**
- A public indexer + a real timeline feed reading on-chain events.
- Images & video — content-addressed media with on-chain references.
- NFT profile photos wired into the UI.
- Private messaging — peer-to-peer, end-to-end encrypted DMs.
- Mobile apps.
- Multiple independent indexers and third-party clients on the same program (client diversity).
- Social / recovery options.
- Open-source release on GitHub.

There is no token, and there won't be a fake one to chase a pump. Elno is a protocol for owning what you say. The architecture exists to make that true at the level where it counts — the chain, the key, and the math — not a promise on a homepage.

— Elno
