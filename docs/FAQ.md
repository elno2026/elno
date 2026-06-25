# Elno FAQ

Straight answers, no spin. I built Elno to put posting on a public ledger instead of on a company's server. Here's how it actually works, what it can't do, and where the rough edges are. If something below is "planned," I say so.

---

## Is it really decentralized, or is that just marketing?

The part that matters is decentralized: your posts. Every post is a real Solana transaction — an event emitted by an on-chain Anchor program (ID `EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX`). Once it's confirmed, it's on mainnet. Any explorer or indexer can read it. I can't reach into the chain and pull it back.

I won't oversell the rest. Today there's a website and a signer backend that I run, and reads go through Helius RPC. That's a convenience layer, not the source of truth. The instructions are open and the IDL is published on-chain, so you don't need my website to post — you can talk to the program directly (see below). The honest framing: the protocol is decentralized; the default client is one I run, and I'm working to make it one of many. A public indexer, third-party clients, and client diversity are on the roadmap, not shipped.

## How is posting basically free?

Because a post isn't a stored account — it's an **event**. Storing data permanently on Solana means paying rent for an account that sits there forever. An event is logged in the transaction and decoded by indexers; there's no account to rent. So a post costs roughly the base network fee, around 5000 lamports — a fraction of a cent.

Usernames are free right now too. Claiming one creates two small on-chain records (a `Profile` and a `HandleClaim`), so you pay a one-time account rent of ~0.004 SOL (about half a cent) plus the network fee. That's it. No subscription, no "pro" tier, no paying me.

## What happens if I lose my key?

You lose the account. I'll be blunt: there is no password reset, no support email that can recover it, no backdoor. Self-custody means **you** are the custody.

Your key is generated in your browser, encrypted locally (AES-GCM, a non-extractable key, stored in IndexedDB), and it never leaves your device. I never have it, so I can't restore it. Back it up: export the key and keep it somewhere safe, or import it into Phantom or Solflare so a real wallet manages it. You can paste that key to log in from any device.

Social and recovery options are on the roadmap. Until they ship, treat your key like the only key to a safe: lose it and what's inside stays locked.

## Can my posts be deleted — by me, by you, by anyone?

By you: sort of. `elnodelete` emits a tombstone event, and `elnoedit` emits a supersede event. Compliant indexers honor those — your deleted post stops showing, your edit replaces the old text. But the original event still exists on-chain forever. Nothing is truly erased; deletion is a signal the indexer respects, not a shredder.

By me: no. I can't edit, hide, shadowban, or delete your posts. There's no instruction that lets the authority touch your content.

By anyone else: no. Only your wallet can sign as you. Edits and deletes are verified by the indexer against the original author's ownership, so nobody can tombstone your post but you.

So: you own it, you can retract it from feeds, but "permanent" is the literal truth of a public ledger. Don't post anything you'd need physically gone.

## Am I anonymous?

By default, yes. No email, no phone, no KYC. Your key is your identity and your login — that's the whole signup.

Be realistic about what anonymity means on a public chain, though. Everything you post is public and permanent, tied to your wallet. If you link that wallet to your real identity — funding it from an exchange in your name, posting facts only you'd know — that connection is on-chain too. Anonymity is the default; staying anonymous is on you.

## Do you store my data or see my key?

I never see your key. It's encrypted on your device and never sent anywhere. The signer backend is stateless: it builds unsigned transactions, proxies RPC reads, and co-signs the one authority-gated step (username registration). Signing happens client-side, in your browser, with your key. The signer literally cannot impersonate you because it never holds the thing it would need to.

Your "data" — posts, profile, follows — isn't stored by me in any meaningful sense. It's on Solana. I run a client and an RPC proxy over the same public data anyone else can read.

## Why only reply and quote? No likes, no reposts, no counters?

On purpose. Only `elnoreply` and `elnoquote` exist. No likes, no reposts, no save button, no follower-count dopamine, no engagement algorithm deciding what you see.

I'm tired of products engineered to maximize time-on-app. Vanity counters turn conversation into a scoreboard and reward the loudest, not the most worth reading. Elno is deliberately calm: you read, you reply, you quote. That's it. Text-only today; images and video are planned, content-addressed with on-chain references.

## Can I post without your website?

Yes, and this is the point. The social instructions are permissionless and the IDL is on-chain, so explorers decode them and you can build the transaction yourself. Send `elnopost` (or reply/quote/edit/delete/follow) straight to the program from your own machine. The website is just one client. The only instruction that needs my co-signature is `register_profile`, because that's how username uniqueness is gated — everything else you can do entirely on your own.

If I disappeared tomorrow, the program stays on mainnet and your key still posts.

## What stops spam?

Two things, and I won't pretend it's a force field. First, money: every post is a transaction with a fee. It's tiny for a human, but spamming at scale costs real SOL and adds up fast. Second, the design: there's no algorithm to game, no likes to farm, no reach to hijack. Spam that nobody is forced to see is far less profitable to produce.

Client-side and indexer-side filtering (mute, block, ranking) is where finer spam control lives, and that's part of building out the public indexer and feed. The base layer makes spam costly; good clients make it ignorable.

## Can the program be changed, and by whom?

Honest answer: yes, it's an upgradeable Anchor program, so the upgrade authority can ship new versions. That's a trust assumption and I'm not going to hide it. Upgradeability is how bugs get fixed and the roadmap ships without forcing everyone to migrate accounts.

What the authority **cannot** do, regardless of upgrades to date: post as you, edit you, or delete you. The platform authority's powers are narrow and on-chain — co-sign new username registrations, set fees (`set_registration_fee`, `set_treasury`, `set_authority`, `initialize_config`), and freeze a profile from publishing *new* posts (`set_profile_status`). That last one is a real power and I won't pretend it away: the authority can stop a profile from posting going forward, but it still can't touch a single word you've already published, and it holds no key to your wallet. Removing or decentralizing that gate — and reducing upgrade trust over time — is on the roadmap.

## How do usernames work? Can I transfer or sell mine?

A username is claimed with `register_profile`, which creates a `HandleClaim` PDA (`["handle", handle]`) that enforces uniqueness at the protocol level — two people can't hold the same handle, the chain won't allow it. Your profile lives at a PDA derived from your wallet (`["profile", owner]`). Display name, bio, and avatar are updated via `elnoprofile`, emitted as an event so it never corrupts your profile account.

You can transfer a handle: `transfer_handle` hands the username to another wallet. Whether you sell it is between you and them — the protocol just moves the claim. I take no cut and run no marketplace.

## Is there a token?

No. There is no Elno token. I'm not launching one, and I'm not going to wink at you about a future airdrop. If anyone offers you an "Elno token," it's a scam. The only asset involved is SOL, to pay network fees.

## What's the catch?

No catch, but real trade-offs — here they are plainly:

- **Lose your key, lose your account.** No recovery yet.
- **Permanent means permanent.** Deletes hide posts from feeds; the original event stays on-chain.
- **The program is upgradeable.** That's a trust assumption today. The authority can't touch your content, but it can ship new code.
- **The default client and indexer are mine for now.** The protocol is open; client diversity is planned, not finished.
- **It's early.** Text-only. No images yet, no DMs yet, no mobile app yet, no token, not open-sourced yet — all on the roadmap.

What you get in return: posts no platform can edit, hide, or delete; an identity that's yours and nobody else's; and the ability to leave my website entirely and keep posting. I built Elno because I think that's worth the rough edges.

— Elno
