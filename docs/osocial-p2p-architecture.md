# Osocial P2P Architecture

Date: 2026-05-23

## Decision

Osocial should keep public social data on Solana and build private chat as a
separate P2P layer.

```text
Solana program
  username, profile proof, public posts, public media hash proof

Osocial web app
  account creation, public feed, media upload, packet inspection

Osocial Peer
  encrypted rooms, DMs, device sync, large file transfer, optional calls
```

The browser app should not pretend to be Keet. Keet-class networking belongs in a
Node/Pear/native runtime where Hyperswarm, HyperDHT, Hypercore, Autobase, and
Hyperbee can run correctly.

## Source Notes

- Pear describes itself as an installable P2P runtime for mobile, desktop, and
  terminal apps, built on Bare rather than the browser runtime:
  https://docs.pears.com/
- Pear lists the stable building blocks we need: Hypercore, Hyperbee, Hyperdrive,
  Autobase, HyperDHT, Hyperswarm, Secretstream, Protomux:
  https://docs.pears.com/
- Hyperswarm is the right first networking primitive for rooms because peers join
  a common 32-byte topic and the swarm handles discovery/reconnections:
  https://docs.pears.com/howto/connect-to-many-peers-by-topic-with-hyperswarm/
- HyperDHT identifies peers by public key and uses hole punching, but direct
  connectivity can fail for difficult NAT pairs. Relaying is not automatic:
  https://docs.pears.com/howto/connect-two-peers-by-key-with-hyperdht/
- Hypercore gives persistence and catch-up when peers are not online at the same
  time:
  https://docs.pears.com/howto/replicate-and-persist-with-hypercore/
- Hyperbee gives a replicated append-only key/value view on top of Hypercore:
  https://docs.pears.com/howto/share-append-only-databases-with-hyperbee/
- Keet publicly describes itself as direct, encrypted P2P chat/calls/files,
  without phone/email signup, backed by Pear Runtime:
  https://keet.io/

## Five-Agent Read

### 1. Runtime And Networking

Use Hyperswarm first, not raw HyperDHT. Hyperswarm gives topic rooms and simpler
connection lifecycle. Raw HyperDHT is useful later for direct one-to-one device
addressing by public key.

Prototype now:

```text
room invite -> topic -> Hyperswarm join -> encrypted newline JSON frames
```

Production later:

```text
account device key -> contact key exchange -> DHT direct connect -> relay fallback
```

### 2. Identity And Crypto

Do not make two users share the same keypair. Each device needs its own identity.
For rooms, a shared invite secret can derive a topic and message key. For DMs,
move to per-device key agreement and authenticated sessions.

Minimum rules:

- One persistent device identity per install.
- Device public key can be linked to an Osocial profile.
- Message envelopes are signed.
- Transport encryption is not enough; application payloads should also be
  encrypted.

### 3. Data And Sync

Ephemeral socket chat is not enough. If Bob is offline, Alice's message is gone.
Hypercore solves this by making each device an append-only log. Autobase becomes
important when a room has many writers and we need deterministic merged state.
Hyperbee is useful for local indexes: messages by room, contacts by key, seen
message IDs, profile cache.

Order:

1. Hyperswarm live messages.
2. Hypercore per-device message log.
3. Autobase room view.
4. Hyperbee indexes.

### 4. Product Integration

Do not block the public on-chain product on P2P. Add Osocial Peer as a separate
layer:

- Public profile exposes optional peer/device public key.
- Message button opens encrypted peer room if supported.
- Browser can show encrypted packet preview.
- Native/Pear app handles real P2P networking.

### 5. Risks

- NAT: direct P2P fails for some network pairs. We need relay policy.
- Offline delivery: impossible without persistence/replication peers.
- Key recovery: device keys need secure backup/sync.
- Metadata: P2P reduces server metadata, but peer IP/connection metadata can
  exist.
- Abuse: public invite rooms need moderation, block lists, and spam throttles.

## Current Repo Prototype

The first runnable prototype is in `peer/`.

```sh
cd peer
npm install
INVITE=$(npm start --silent -- create)
OSOCIAL_PEER_INVITE="$INVITE" npm start -- join --name alice
OSOCIAL_PEER_INVITE="$INVITE" npm start -- join --name bob
```

This confirms discovery, direct socket connection where possible, encrypted
frames, and signature verification. It is intentionally terminal-only so it does
not compromise the browser app build.
