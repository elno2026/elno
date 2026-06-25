# Elno Founder NFT — Launch Checklist

Metaplex **Core Candy Machine** + **Sugar** ile. Once DEVNET (bedava), sonra MAINNET.

## Plan (varsayilan — onayla/ayarla)
- **Koleksiyon:** Elno Founder (OG)
- **Adet:** 1000
- **Fiyat:** 0.25 SOL  (Sol Payment guard -> treasury 89EvL1...)
- **Cuzdan basina limit:** 5 (Mint Limit guard)
- **Bot koruma:** Bot Tax guard
- **Royalty:** %5 (sellerFeeBasisPoints 500) -> ikincil satistan gelir
- **Ayricaliklar:** dogrulanmis altigen OG rozet (elnopfp), erken erisim, OG flair, ileride airdrop onceligi

## Adimlar
1. [ ] Sanat hazirla (Recraft prompt — bkz. nft/ART_PROMPT.txt). 1000 edition: tek tasarim + numara, veya generative.
2. [ ] Toolchain kur: `solana`, `metaplex` Sugar CLI, `node` (umi).
3. [ ] assets/ klasoru: 0.png..999.png + 0.json..999.json (metadata).
4. [ ] `sugar config create` -> config.json (guard'lar: solPayment, mintLimit, botTax, startDate).
5. [ ] DEVNET: `solana config set --url devnet`, `solana airdrop 2`, `sugar upload`, `sugar deploy`, `sugar guard add`.
6. [ ] Test mint (devnet, bedava). Cuzdanlarda gorunum + altigen avatar dogrula.
7. [ ] MAINNET: ayni adimlar, gercek SOL (deploy ~1-2 SOL, mint sirasinda iade edilebilir rent).
8. [ ] Mint sayfasi: Elno app icinde "Connect Wallet -> Mint" (umi + wallet-adapter) veya Metaplex template.
9. [ ] Tukenince `sugar withdraw` -> rent iade.

## Gelir
Tum mint geliri ve %5 royalty -> treasury (89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF).
