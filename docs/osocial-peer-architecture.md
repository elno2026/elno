# Osocial Peer Architecture

Osocial should split public social and private messaging into two layers.

## Layer Split

```text
Osocial Web
- Solana username/profile proof
- public on-chain post events
- media upload + content hash
- public feed/indexer UX

Osocial Peer
- private DMs
- private rooms
- device-to-device file transfer
- device sync
- optional encrypted relay only when direct P2P is unavailable
```

The browser app should not pretend to be Keet. Keet-style behavior needs a
native/Pear-like runtime because direct peer discovery, local append-only logs,
and large P2P file transfers are not a good fit for a normal hosted web page.

## MVP

1. Terminal/native P2P prototype with Hyperswarm discovery.
2. Shared invite creates a room topic.
3. App-level encrypted message envelope.
4. Local append-only message log.
5. Room invite link that can later be tied to an Osocial profile.

## Protocol V0

Room invite:

```text
invite -> SHA-256/HKDF -> hyperswarm topic + room message key
```

Message envelope:

```json
{
  "v": 1,
  "type": "message",
  "id": "random-128-bit-id",
  "from": "alice",
  "fromPublicKey": "ed25519-spki-base64",
  "to": "room",
  "alg": "AES-256-GCM+Ed25519",
  "iv": "base64",
  "tag": "base64",
  "c": "base64",
  "sig": "base64",
  "at": "iso-date"
}
```

## Final Protocol Requirements

- Persistent identity key per user/device.
- Recovery seed or recovery wallet protected export.
- Separate room key from identity key.
- Member list and role changes.
- Replay protection and message ordering.
- Local encrypted storage.
- File transfer chunks with content hash and resume.
- Optional relay mode that never sees plaintext.
- Bridge to Solana only for public identity proof, not DM content.

## Non-Goals For V0

- No Solana transactions for DMs.
- No phone number or email identity.
- No centralized plaintext message server.
- No promise of IP metadata hiding in direct P2P mode.

## Open Risks

- NAT traversal can fail; some users will need relay fallback.
- Shared invite rooms are simple but not enough for production access control.
- Mobile support requires runtime decisions separate from the current Vite app.
- Browser-only P2P would need WebRTC signaling and TURN, which is a different
  architecture from Keet/Holepunch.

