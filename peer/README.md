# Osocial Peer Prototype

This is the first native P2P transport prototype for Osocial.

It is separate from the Vite web app because browser JavaScript cannot run the
full Keet/Pear/Hyperswarm stack directly. The web app owns public on-chain posts
and UX. This folder starts the Keet-like peer layer: device-to-device discovery,
encrypted room packets, and message/file transport experiments.

## Run Two Peers

Terminal A:

```bash
cd peer
npm install
INVITE=$(npm start --silent -- create)
echo "$INVITE"
OSOCIAL_PEER_INVITE="$INVITE" npm start -- join --name alice
```

Terminal B:

```bash
cd peer
OSOCIAL_PEER_INVITE="paste-the-invite" npm start -- join --name bob
```

Both peers derive the same 32-byte Hyperswarm topic from the invite. Hyperswarm
handles peer discovery through the DHT. The app then encrypts every message frame
with AES-256-GCM and signs the encrypted envelope with an Ed25519 device key.

## Protocol V0

```text
invite secret
  -> sha256 topic context
  -> Hyperswarm DHT discovery topic
  -> HKDF message key
  -> AES-GCM encrypted message envelope
  -> Ed25519 signature over envelope fields
  -> newline-delimited JSON frame over peer socket
```

## Scope

- Current: encrypted text frames over Hyperswarm for developer testing.
- Current: browser-safe encrypted peer envelope demo in `src/peerCrypto.js`.
- Next: persistent device identity instead of temporary runtime identity.
- Next: Hypercore/Corestore per room for append-only history and offline catch-up.
- Later: Hyperdrive for large media/file transfer.

## Security Notes

- P2P does not hide IP metadata from a connected peer.
- Offline delivery needs another online replica, relay, or persistent device.
- Invite secrets must be high entropy. Use `npm start -- create`.
- Seed phrases/private keys must never be collected by a server.
