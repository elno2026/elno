# Osocial Peer MVP

## Decision

Osocial should not put DMs on-chain. Public posts, usernames, and profile proofs stay on Solana. Private communication becomes a separate Osocial Peer layer.

The production target is Keet-like:

- no phone or email requirement
- device-held identity keys
- direct P2P where possible
- encrypted transport
- encrypted message envelopes
- file transfer outside Solana
- Solana profile only used as a public proof and discovery anchor

## 5-agent research result

### 1. Product and UX

MVP flow:

1. User creates or opens an Osocial account in the web app.
2. App shows a `Peer` or `Messages` area with a device identity.
3. User creates a room invite.
4. Invite contains room id, topic hash, profile wallet, handle, and public peer key.
5. Receiver opens invite and joins the same peer topic.
6. Text and files move off-chain.
7. Solana is only used to prove the username/profile belongs to the wallet.

First MVP screens:

- Inbox
- Room
- Invite sheet
- Peer status: direct, relayed, offline
- File transfer row: queued, seeding, downloading, complete

### 2. P2P protocol

Use Hyperswarm/Pear-style architecture for native builds.

Minimum:

- topic = sha256(`osocial-peer:v0:<roomId>`)
- identity = device keypair
- connection = Hyperswarm connection stream
- frame = compact JSON first, binary codec later

Later:

- Protomux channels for messages, file chunks, presence, receipts
- Hypercore/Corestore for append-only room logs
- Hyperdrive for file/media transfer

### 3. Crypto

Layer 1: transport encryption from the P2P stack.

Layer 2: application encryption envelope:

```json
{
  "v": 1,
  "type": "osocial-peer-message",
  "from": "sender-wallet",
  "to": "receiver-wallet",
  "alg": "ECDH-P256+A256GCM",
  "codec": "br-json",
  "iv": "...",
  "c": "..."
}
```

Browser MVP uses WebCrypto ECDH P-256 + AES-GCM. Native target should move to X25519/Noise-compatible keys where possible.

### 4. Solana connection

On-chain profile should eventually include or point to:

- public peer key hash
- preferred peer invite endpoint or static peer identity
- username claim tx
- profile wallet

Do not store private DM data on-chain.

### 5. Ops and risk

P2P risks:

- direct P2P can expose IP metadata to peers
- offline delivery requires relay or replicated peers
- mobile background execution is hard
- file transfer needs content hash verification
- abuse controls are needed for invites and spam

Production path:

1. Browser encrypted relay DM first if speed matters.
2. Native Osocial Peer app second for true Keet-like networking.
3. Keep both compatible through the same envelope format.

## First implementation now

Added:

- `src/peerCrypto.js`: browser-safe encrypted peer envelopes.
- `scripts/peer_crypto_smoke.mjs`: verifies Alice -> Bob encryption/decryption.
- `peer/src/peer-cli.mjs`: first encrypted Hyperswarm CLI peer.
- `peer/src/crypto.mjs`: invite/topic derivation, AES-GCM envelopes, and Ed25519 signatures.
- `peer/README.md`: how to run two local peers.

## Source notes

- Pear docs describe Pear as a native P2P-capable runtime and list Hypercore, Hyperdrive, HyperDHT, and Hyperswarm as building blocks: https://docs.pears.com/
- Hyperswarm README describes topic discovery and says connection sockets are Noise encrypted streams: https://github.com/holepunchto/hyperswarm
- Keet support describes peer-to-peer chat/media without central servers and recovery through a seed phrase: https://support.keet.io/
- Keet file sharing support notes smooth file transfer requires online peers: https://support.keet.io/file-sharing-and-messages/sharing-files-and-media
