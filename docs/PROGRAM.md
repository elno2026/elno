# Elno — On-Chain Program Reference

This is the protocol. Everything else — the website, the signer, any future indexer or third-party client — is just software pointed at the program below. The program is the source of truth, and it lives on Solana mainnet where anyone can read it, verify it, and write to it.

I wrote this so you don't have to trust me. Decode the IDL from any explorer and check it against what's here.

## At a glance

| | |
|---|---|
| **Program ID (mainnet)** | `EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX` |
| **Framework** | Anchor 0.31.1 (Rust) |
| **Cluster** | Solana mainnet-beta |
| **Upgradeable** | Yes — deployed via the BPF upgradeable loader |
| **IDL** | Published on-chain (explorers decode names automatically) **and** committed to this repo at [`idl/elno.json`](../idl/elno.json) |
| **Internal crate name** | `osocial_registry` (the `elno` instruction prefix is the brand; the crate kept its original name) |
| **Platform authority** | `89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF` — co-signs username registration and admin only |
| **Treasury** | `89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF` — receives the registration fee (currently `0`) |

### Build a client in one minute

The machine-readable interface is right here in the repo — [`idl/elno.json`](../idl/elno.json) — so you don't have to hand-roll anything. With Anchor:

```js
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import idl from './idl/elno.json' assert { type: 'json' }

const program = new Program(idl, new AnchorProvider(connection, wallet, {}))
// derive your profile PDA and post:
const [profile] = PublicKey.findProgramAddressSync(
  [Buffer.from('profile'), wallet.publicKey.toBuffer()],
  program.programId,
)
await program.methods.elnopost('osocial:v0:json:{"v":0,"type":"post","t":"gm","m":[]}')
  .accounts({ user: wallet.publicKey, profile })
  .rpc()
```

Prefer no framework? `cli/elno.mjs` does the same thing with raw `@solana/web3.js` and hand-built discriminators — read it, it's ~150 lines.

A note on "upgradeable": the program can be upgraded by its upgrade authority. That is a deliberate, honest trade-off for a product this young — bugs get fixed, features land. It does not give anyone the power to post as you, edit you, or delete you. The security boundary is your private key, not the program's immutability. Freezing the upgrade authority is on the roadmap once the surface stabilizes.

## How a post actually works

A post is **not** a stored account. It's an Anchor **event** emitted inside a Solana transaction. The transaction touches your `Profile` PDA to bump a counter, emits the event, and that's it. The event is part of the permanent transaction log — readable from any explorer, any RPC, any indexer, forever.

That's why posting is cheap: you pay the network fee (~5000 lamports) and nothing else. No per-post rent, because there is no per-post account.

A handful of legacy instructions (`create_post`) *do* allocate a `Post` account. The live client does not use that path — it uses the event-based `elnopost` family. Both are documented below for completeness.

---

## Instructions

The platform authority co-signs exactly two categories: **username registration** and **admin config**. Everything social — posting, replying, editing, deleting, following, profile edits, handle transfer — needs **only your signature**. The authority is not in that loop and cannot be.

### Social (you sign — authority never touches these)

| Instruction | Args | Effect | Who may call |
|---|---|---|---|
| `elnopost` | `packet: String` | Emits `PostPacketCreated`. Bumps `profile.post_count`. The cheap, standard way to publish. | Profile owner (signer) |
| `elnoreply` | `packet: String`, `reply_to: String` | Emits `ReplyCreated`. `reply_to` is the parent post's tx signature. Bumps post count. | Profile owner (signer) |
| `elnoquote` | `packet: String`, `quote_of: String` | Emits `QuoteCreated`. `quote_of` is the quoted post's tx signature. Bumps post count. | Profile owner (signer) |
| `elnoedit` | `packet: String`, `edit_of: String` | Emits `EditCreated` superseding `edit_of`. **Does not** bump post count — it's a revision, not a new post. | Profile owner (signer) |
| `elnodelete` | `target: String` | Emits `DeleteCreated` (a tombstone) for `target`. **Does not** bump post count. Nothing is erased on-chain; the indexer hides the target. | Profile owner (signer) |
| `elnofollow` | `following: Pubkey` | Creates a `Follow` PDA, emits `FollowCreated`. Cannot follow yourself; the PDA's `init` prevents double-follows. | Any wallet (signer) |
| `elnounfollow` | `following: Pubkey` | Closes the `Follow` PDA (rent refunded to you), emits `FollowRemoved`. | The follower (signer) |
| `elnoprofile` | `display_name: String`, `bio: String`, `avatar: String` | Emits `ProfileMetaUpdated`. **Event-based** — does not write to the `Profile` account, so existing profiles can never be corrupted by a meta change. Indexer shows the latest meta event. `avatar` may be an image URL or an `nft:<mint>` reference. | Profile owner (signer) |
| `elnopfp` | `nft_mint: Pubkey`, `owner_wallet: Pubkey` | Emits `PfpSet`. Sets an NFT as your profile photo. The NFT stays in `owner_wallet` (your main/recovery wallet, never the device wallet). The indexer verifies that `owner_wallet` still holds the NFT; if it's transferred away, the indexer drops the badge. | Profile owner (signer) |
| `transfer_handle` | `new_owner: Pubkey` | Reassigns the `HandleClaim.owner` to `new_owner`, emits `HandleTransferred`. Hand a username to another wallet (gift/sale/migration). `new_owner` can't be the default key or the current owner. | Current handle owner (signer) |
| `create_post_packet` | `packet: String` | Legacy alias of `elnopost`; emits `PostPacketCreated`. | Profile owner (signer) |
| `create_post` | `packet: String` | **Legacy.** Allocates a `Post` PDA (`["post", user, post_count]`) and emits `PostCreated`. Costs rent. Not used by the live client; kept for compatibility. | Profile owner + authority (both sign) |

**Packet limits.** Event posts (`elnopost`/reply/quote/edit) allow up to **1024 bytes**; the legacy account-storing `create_post` allows **512 bytes**. Packets can't be empty or whitespace-only. Parent references (`reply_to`/`quote_of`/`target`/`edit_of`) are capped at **96 bytes** — enough for a base58 tx signature.

### Identity

| Instruction | Args | Effect | Who may call |
|---|---|---|---|
| `register_profile` | `handle: String`, `display_name: String` | Creates your `Profile` PDA and a `HandleClaim` PDA (which enforces global username uniqueness on-chain). Transfers the registration fee (currently `0`) to the treasury. Emits `ProfileRegistered` + `UsernameClaimed`. | **You + platform authority** (both sign) |
| `update_profile` | `display_name: String` | Writes a new `display_name` into the `Profile` account. Legacy account-based path; the live client prefers the event-based `elnoprofile`. | Profile owner + authority (both sign) |

**Handle rules** (enforced in the program, not just the UI): 3–30 bytes, lowercase ASCII letters / digits / `_` / `.` only. A separator can't start a handle, end it, or repeat (`a__b`, `a.`, `.a` all rejected).

### Admin (platform authority only)

These can set fees and rotate config keys. None of them can read your key, post for you, or alter your content. The worst an admin can do is disable a profile from registering/posting through the gated paths and change the registration fee (hard-capped at 1 SOL in lamports).

| Instruction | Args | Effect | Who may call |
|---|---|---|---|
| `initialize_config` | `registration_fee_lamports: u64` | Creates the singleton `Config` PDA. One-time bootstrap. | Platform authority |
| `set_authority` | `new_authority: Pubkey` | Rotates the config authority (constrained to the expected authority key). Emits `AuthorityUpdated`. | Platform authority |
| `set_treasury` | `new_treasury: Pubkey` | Updates the fee recipient. Emits `TreasuryUpdated`. | Platform authority |
| `set_registration_fee` | `registration_fee_lamports: u64` | Sets the username fee (max 1 SOL). Emits `RegistrationFeeUpdated`. | Platform authority |
| `set_profile_status` | `active: bool` | Enables/disables a profile's gated actions. Emits `ProfileStatusUpdated`. | Platform authority |

---

## Accounts

Only four account types matter for the social graph. Posts themselves are events, so there's no per-post account in the standard flow.

| Account | Purpose | Fields |
|---|---|---|
| **Config** (`RegistryConfig`) | Singleton. Holds the authority key, the treasury key, and the current registration fee. | `authority: Pubkey`, `treasury: Pubkey`, `registration_fee_lamports: u64`, `bump: u8` |
| **Profile** | Your identity anchor. One per wallet. Stores your handle, display name, creation time, lamports paid, post counter, and an `active` flag. The `post_count` is what every event-post bumps to stay ordered. | `owner: Pubkey`, `handle: String`, `display_name: String`, `created_at: i64`, `paid_lamports: u64`, `post_count: u64`, `active: bool`, `bump: u8` |
| **HandleClaim** | The uniqueness enforcer. Its PDA seed *is* the handle, so two wallets can never claim the same username — the second `init` fails at the protocol level. Also records who owns the handle (mutated by `transfer_handle`). | `owner: Pubkey`, `profile: Pubkey`, `handle: String`, `bump: u8` |
| **Follow** | One PDA per (follower → following) edge. Created by `elnofollow`, closed by `elnounfollow` (rent refunded). | `follower: Pubkey`, `following: Pubkey`, `created_at: i64`, `bump: u8` |
| **Post** *(legacy)* | Only allocated by the legacy `create_post`. The live client never creates these. | `owner: Pubkey`, `profile: Pubkey`, `sequence: u64`, `packet: String`, `created_at: i64`, `bump: u8` |

## PDA seeds

All PDAs derive from the program ID `EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX`.

| PDA | Seeds |
|---|---|
| Config | `["config"]` |
| Profile | `["profile", owner_pubkey]` |
| HandleClaim | `["handle", handle_bytes]` |
| Follow | `["follow", follower_pubkey, following_pubkey]` |
| Post *(legacy)* | `["post", owner_pubkey, post_count_le_bytes]` |

Because the Profile seed is your own pubkey and the HandleClaim seed is the handle itself, there is exactly one profile per wallet and exactly one wallet per handle. No registry of registries, no off-chain uniqueness check to trust. It's structural.

---

## Events

Events are the actual data layer. An indexer (mine, yours, anyone's) reconstructs the entire network by streaming these from transaction logs. The list is the API surface a client reads from.

| Event | Emitted by | Key fields |
|---|---|---|
| `ConfigInitialized` | `initialize_config` | `authority`, `treasury`, `registration_fee_lamports` |
| `AuthorityUpdated` | `set_authority` | `previous_authority`, `new_authority` |
| `TreasuryUpdated` | `set_treasury` | `previous_treasury`, `new_treasury` |
| `RegistrationFeeUpdated` | `set_registration_fee` | `registration_fee_lamports` |
| `ProfileRegistered` | `register_profile` | `owner`, `profile`, `handle`, `paid_lamports` |
| `UsernameClaimed` | `register_profile` | `owner`, `profile`, `username_index` (the HandleClaim PDA), `handle`, `display_name`, `created_at` |
| `PostPacketCreated` | `elnopost` / `create_post_packet` | `owner`, `profile`, `sequence`, `packet`, `created_at` |
| `ReplyCreated` | `elnoreply` | `owner`, `profile`, `sequence`, `packet`, `reply_to`, `created_at` |
| `QuoteCreated` | `elnoquote` | `owner`, `profile`, `sequence`, `packet`, `quote_of`, `created_at` |
| `EditCreated` | `elnoedit` | `owner`, `profile`, `packet`, `edit_of`, `created_at` |
| `DeleteCreated` | `elnodelete` | `owner`, `profile`, `target`, `created_at` |
| `FollowCreated` | `elnofollow` | `follower`, `following`, `created_at` |
| `FollowRemoved` | `elnounfollow` | `follower`, `following`, `created_at` |
| `ProfileMetaUpdated` | `elnoprofile` | `owner`, `profile`, `display_name`, `bio`, `avatar`, `created_at` |
| `PfpSet` | `elnopfp` | `owner`, `profile`, `nft_mint`, `owner_wallet`, `created_at` |
| `HandleTransferred` | `transfer_handle` | `handle`, `handle_claim`, `previous_owner`, `new_owner`, `created_at` |
| `ProfileUpdated` | `update_profile` | `owner`, `profile`, `handle` |
| `ProfileStatusUpdated` | `set_profile_status` | `owner`, `profile`, `active` |
| `PostCreated` *(legacy)* | `create_post` | `owner`, `profile`, `post`, `sequence` |

---

## Edit and delete: nothing is truly erased

This is the part people misread, so I'll be blunt about it.

When you **edit**, the program emits an `EditCreated` event that points at the original post's tx signature via `edit_of`. The original event is **still on-chain**. It always will be. What changes is what a reader *shows*: the indexer sees the edit, confirms the editor is the original author (same `owner`), and renders the new text in place of the old. The history is public to anyone who looks at the raw log.

When you **delete**, the program emits a `DeleteCreated` tombstone pointing at `target`. Again, the original post is **not removed** — Solana's log is append-only, and so is this. The indexer reads the tombstone and hides the target from feeds. The bytes remain forever.

So "delete" here means *hide on conforming clients*, not *destroy*. That's not a weakness I'm hiding — it's the whole point of an on-chain network. Permanence cuts both ways. If you wouldn't carve it in stone, don't post it. I'd rather tell you that plainly than pretend a decentralized log can forget.

Ownership of edits and deletes is verified by the indexer, not by a privileged account. Only events whose `owner` matches the original author's wallet count. Nobody — not me, not the authority — can edit or tombstone your post, because they can't sign as you.

---

## Fees

| Action | Cost |
|---|---|
| Claim a username | **Free today** — `registration_fee_lamports` is `0`. You pay only one-time account rent for the `Profile` + `HandleClaim` PDAs (~0.004 SOL together). There is no close instruction for these yet, so that rent stays locked for now. |
| Publish a post (`elnopost`/reply/quote/edit/delete) | ~**5000 lamports** network fee. No per-post rent — posts are events, not accounts. |
| Follow | Rent for one small `Follow` PDA, **refunded** when you unfollow, plus the network fee. |
| Edit / delete | Network fee only. No counter bump, no new account. |

The registration fee is capped in the program at 1 SOL (`MAX_REGISTRATION_FEE_LAMPORTS`). It is `0` now, and any change to it emits `RegistrationFeeUpdated` on-chain — visible to everyone, no quiet price hikes.

---

## Post directly to the program, no website needed

The website is one client. It holds no special power. Every social instruction is permissionless and signed by your key alone, which means you can talk to the program straight from your own machine.

What you need:

1. **A wallet** that owns a registered `Profile` (i.e. you've claimed a handle). Plain Solana keypair — paste your Elno key, or import it into a CLI/SDK.
2. **The IDL**, which you can pull on-chain (`anchor idl fetch EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX`) — no need to trust any file I hand you.
3. **An RPC endpoint** to send the transaction.

Then, with Anchor's TS client (or `solana-py`, or raw instructions):

```ts
import { Program, AnchorProvider } from "@coral-xyz/anchor";

const PROGRAM_ID = "EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX";
const profilePda = PublicKey.findProgramAddressSync(
  [Buffer.from("profile"), wallet.publicKey.toBuffer()],
  new PublicKey(PROGRAM_ID),
)[0];

// Publish a post — only your signature is required.
await program.methods
  .elnopost("posted straight to the program, no website involved")
  .accounts({ user: wallet.publicKey, profile: profilePda })
  .rpc();
```

The only instruction you **can't** do solo is the *first* one — `register_profile` requires the platform authority co-signature (it's the one authority-gated step, and it's what makes usernames a co-issued, unique-by-PDA claim). After you have a handle, every post, reply, quote, edit, delete, follow, and profile update is yours to send, from any tool, with no permission from anyone. Build your own client. That's the design, not a loophole.

— Elno
