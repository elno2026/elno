# Elno Founder NFT — Launch Checklist

Using Metaplex **Core Candy Machine** + **Sugar**. First DEVNET (free), then MAINNET.

## Plan (defaults — confirm/adjust)
- **Collection:** Elno Founder (OG)
- **Quantity:** 1000
- **Price:** 0.25 SOL  (Sol Payment guard -> treasury 89EvL1...)
- **Limit per wallet:** 5 (Mint Limit guard)
- **Bot protection:** Bot Tax guard
- **Royalty:** 5% (sellerFeeBasisPoints 500) -> revenue from secondary sales
- **Perks:** verified hexagonal OG badge (elnopfp), early access, OG flair, future airdrop priority

## Steps
1. [ ] Prepare the art (Recraft prompt — see nft/ART_PROMPT.txt). 1000 editions: single design + number, or generative.
2. [ ] Set up the toolchain: `solana`, `metaplex` Sugar CLI, `node` (umi).
3. [ ] assets/ folder: 0.png..999.png + 0.json..999.json (metadata).
4. [ ] `sugar config create` -> config.json (guards: solPayment, mintLimit, botTax, startDate).
5. [ ] DEVNET: `solana config set --url devnet`, `solana airdrop 2`, `sugar upload`, `sugar deploy`, `sugar guard add`.
6. [ ] Test mint (devnet, free). Verify the appearance in wallets + the hexagonal avatar.
7. [ ] MAINNET: same steps, real SOL (deploy ~1-2 SOL, refundable rent during minting).
8. [ ] Mint page: inside the Elno app "Connect Wallet -> Mint" (umi + wallet-adapter) or a Metaplex template.
9. [ ] Once sold out, `sugar withdraw` -> rent refund.

## Revenue
All mint revenue and the 5% royalty -> treasury (89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF).
