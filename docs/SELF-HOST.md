# Run your own Elno — post anonymously, straight to the chain

The whole point of Elno is that you don't need me. You don't need this website, my signer, or my servers to use it. You register a username once, you save your key, and from then on you write to the program yourself — from your own machine, with your own RPC, signed by your own key. Nobody is in the middle.

This is the guide for doing exactly that.

## The one thing that goes through the site

Claiming a username (`register_profile`) is the single step that needs the platform authority's co-signature. That's the spam gate on the namespace, and it's the only place Elno-the-service touches your flow. So:

1. Go to the Elno site once and claim your username.
2. When it shows you your **private key**, save it. That key *is* your account. We never see it, never store it, and can never recover it.

That's the last time you need the site. Everything below runs on your own.

## What you can do entirely on your own

Once you have a registered key, these instructions are **permissionless** — they need nobody's signature but yours:

`elnopost` · `elnoreply` · `elnoquote` · `elnoedit` · `elnodelete` · `elnofollow` · `elnounfollow` · `elnoprofile`

You send them straight to the program. No website, no signer, no API key, no account on anything.

## Set up the CLI

```bash
git clone https://github.com/elno2026/elno
cd elno
npm install
```

Put the key you saved (base58, the same string you'd import into Phantom) into a file:

```bash
echo 'YOUR_BASE58_PRIVATE_KEY' > elno-key.txt
chmod 600 elno-key.txt
```

> `elno-key.txt` is your wallet. Treat it like cash. It's already covered by `.gitignore` — never commit it, never paste it anywhere.

Point it at an RPC. For real privacy, use your **own** RPC endpoint (a Helius/your-provider key, or your own node) rather than a public one — whoever runs the RPC can see which IP submitted which transaction:

```bash
export ELNO_RPC='https://your-own-rpc-endpoint'
export ELNO_KEY='./elno-key.txt'
```

## Post

```bash
node cli/elno.mjs whoami
node cli/elno.mjs post "first post from my own machine, signed by my own key"
node cli/elno.mjs reply <parentTxSig> "good point"
node cli/elno.mjs quote <parentTxSig> "everyone should read this"
node cli/elno.mjs follow <wallet>
node cli/elno.mjs unfollow <wallet>
```

Every command builds the transaction locally, signs it with your key, and sends it to the program. The signature comes back; the post is on mainnet; any explorer or indexer can read it. I was never involved.

## Staying anonymous — the honest checklist

- **Your key never leaves your machine.** The CLI signs locally. Nothing is uploaded but the signed transaction itself.
- **Use your own RPC.** The RPC provider sees the IP that submits a transaction. A public endpoint, or mine, is a metadata leak. Run your own or use one you trust. Tor/VPN in front of it if you're serious.
- **Fund the wallet privately.** On-chain analysis can link a wallet to wherever its SOL came from. If the goal is anonymity, don't fund this wallet from an exchange account tied to your name.
- **One identity per key.** The key is the identity. Want a separate persona? Use a separate key (register another username).
- **The chain is forever.** Nothing here can be unposted. "Delete" hides a post in compliant indexers; the original event stays on-chain. Write like it's permanent, because it is.

## Build your own client

The CLI is just one program talking to the protocol. The protocol is the on-chain program — `EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX`, with its IDL published on-chain. Anything the CLI does, your own app can do: derive the profile PDA, build the instruction, sign, send. See [PROGRAM.md](PROGRAM.md) for every instruction, account, PDA, and event.

If you build a better client than mine, you haven't forked Elno — you've *become* Elno. That was always the plan.

— Elno
