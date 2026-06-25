EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX is the program. It is the protocol. Everything below is built on top of it — or, if I do my job right, built by other people on top of it without asking me.

This roadmap is a direction, not a release calendar. I'd rather ship the right thing late than promise dates I'll miss.

---

## What this roadmap is — and isn't

Two columns matter: **Live today** and **Planned**. I won't blur them. If something is real, you can use it right now on mainnet. If it's planned, it doesn't exist yet — no matter how good it sounds here.

There's no token on this roadmap. There never has been one, and nothing below requires one. Anyone who tells you otherwise is selling something that isn't Elno.

---

## The one principle everything hangs on

**The program is the protocol.** The on-chain Anchor program at `EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX` defines what a post, reply, quote, edit, follow, and profile *are*. The IDL is published on-chain. The instructions are permissionless — you can post straight to the program from your own machine.

That means the website is just one client. The signer is just one helper. Every item on the "Planned" list below is something that should be buildable by me **or by anyone else**, against the same program, without my permission. I'm describing a direction for the protocol. I am not claiming to be the only one allowed to walk it.

---

## Live today

These work end to end on Solana mainnet right now:

| Capability | How it works on-chain |
|---|---|
| Text posts | `elnopost` — an event, not a stored account (~5000 lamports) |
| Replies | `elnoreply` with a `reply_to` parent tx |
| Quotes | `elnoquote` with a `quote_of` parent tx |
| Edits | `elnoedit` — a supersede event; the original stays on-chain, the indexer interprets the latest |
| Deletes | `elnodelete` — a tombstone event; nothing is truly erased, ownership is verified by the indexer |
| Usernames | `register_profile` + a `HandleClaim` PDA enforcing uniqueness at the protocol level (free now, ~0.004 SOL one-time account rent) |
| Follow / unfollow | `elnofollow` / `elnounfollow`, backed by a `Follow` PDA |
| On-chain profile | `elnoprofile` — display name, bio, avatar, emitted as an event so it never corrupts existing profile accounts |
| Username transfer | `transfer_handle` — hand a handle to another wallet |
| Self-custody login | Wallet generated in your browser, encrypted locally (AES-GCM, non-extractable key, IndexedDB). Paste your key to log in anywhere, or import it into Phantom/Solflare. The key never touches a server. |
| On-chain IDL | Explorers decode the instruction names directly |

No likes. No reposts. No vanity counters. That's a choice, and it stays.

---

## Planned

Everything in this section is **not built yet**. Order is roughly the order I expect to tackle it, but I'll reorder when reality demands it. None of it changes the security model: your key stays on your device, and the program stays the source of truth.

### Phase 1 — A public indexer and a real timeline feed

Right now the events are all on-chain, but reading them into a coherent feed is the missing piece. I want a public indexer that watches the program, interprets edits and deletes and follows the way the protocol intends, and serves a real timeline — your follows, replies threaded, quotes resolved.

The indexer reads on-chain truth; it never becomes the truth. If it disappears, your posts don't. Anyone should be able to stand one up and get the same answers, because it's all derived from the same events.

### Phase 2 — Images and video

Text-only is the honest starting point, not the destination. Media comes next, done the right way: content-addressed storage with **on-chain references** to the content hash. The bytes live off-chain where bytes belong; the program holds the pointer and the proof. Your media is verifiable and tamper-evident without bloating the chain.

### Phase 3 — NFT profile photos in the UI

The `elnopfp` instruction already exists at the protocol level — you can set an NFT as your profile photo, and the NFT stays in your main/recovery wallet, never the device wallet. What's missing is the UI that reads it, verifies ownership, and renders it. This phase wires that end to end.

### Phase 4 — Private messaging

Peer-to-peer, end-to-end encrypted DMs. The same rule that governs everything else applies hardest here: the keys are yours, the plaintext never leaves your device, and no server — not even the signer — can read your messages. If I can read your DMs, I built it wrong.

### Phase 5 — Mobile apps

Native mobile, with the same self-custody model: the wallet is generated and encrypted on your device, the private key never leaves it. A phone is where most people actually live; the security guarantees can't soften just because the screen got smaller.

### Phase 6 — Client diversity: many indexers, many clients

This is the one that matters most to me. Because the program is the protocol, there should be **more than one** indexer and **more than one** client — built by people who are not me, who don't need my blessing, all reading and writing the same program. The website is one client. The day it's one of many is the day Elno stops being something I run and starts being something that runs without me.

### Phase 7 — Social recovery

Self-custody is freedom, and a lost key is the price. I want recovery options that don't betray the model — no custodian who can seize your account, no backdoor I hold. Social or guardian-based recovery that you configure and control, so a lost device isn't a lost identity.

### Phase 8 — Open source on GitHub

The frontend, the signer, and the program get published. Permissionless isn't fully true until you can read every line, run the signer yourself, and fork the client. This is what closes the loop on everything above: when the code is open, "anyone can build on the program" stops being a promise and becomes something you can verify by doing it.

---

## What won't change

- **Your key never leaves your device.** Not for media, not for DMs, not for mobile, not ever.
- **The program stays the source of truth.** Indexers, feeds, and clients are conveniences layered on top — never gatekeepers.
- **No engagement machinery.** No likes, no reposts, no algorithm optimizing for your attention. Calm is a feature.
- **No token.** Nothing here is funded by, gated behind, or an excuse for one.

I built Elno because I wanted a place to speak that no company owns and no platform can quietly erase. The roadmap above is just the work of making that place better without ever taking that ownership back from you.

— Elno