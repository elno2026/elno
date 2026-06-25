# The Elno Manifesto

I built Elno because I got tired of renting my own voice.

Every account you have on a social platform is a lease. You don't own the apartment — you're a tenant, and the landlord can change the locks any morning without telling you why. They can quiet you so the room can't hear you. They can read everything you've ever said, sell it, train on it, hand it to whoever asks. They can decide, retroactively, that the thing you posted three years ago is now a crime against the terms of service. You agreed to all of it the second you typed your phone number into the signup box.

We've been told this is just how the internet works. It isn't. It's how *their* internet works, because they own the database and you don't.

## What's actually broken

The problem isn't one bad platform. It's the shape of the thing.

When a single company owns the server that holds your speech, a few facts follow whether they intend them or not:

- **They can delete you.** Not the post — *you*. The account, the history, the followers, the years. One policy decision, no appeal, gone.
- **They can hide you without telling you.** Shadowbanning is censorship that denies it's happening. You keep talking. Nobody's there. You can't even prove it.
- **They watch everything.** Not just what you post — what you hover over, how long you pause, who you message at 3am. Surveillance isn't a side effect of the product. It *is* the product.
- **You are the inventory.** Your attention, your data, your social graph — packaged and sold. You don't get a cut. You get an algorithm tuned to keep you angry, because angry scrolls longer.
- **Your identity is a leash.** Phone, email, KYC, a real name attached to a face. They call it safety. It's a list. Lists get leaked, subpoenaed, and sold, and the people who most need to speak freely are exactly the people a list gets killed.
- **The feed is engineered against you.** You don't see what you chose to follow. You see what keeps you scrolling. Your own timeline is optimized for someone else's quarterly numbers.

None of this is fixable with a better moderation team or a friendlier CEO. The power sits in who holds the data. As long as that's a company, the company wins — and you are always one policy update away from silence.

## What I believe

Speech should be **ownable.** If you wrote it, it's yours. Not licensed to you. Yours.

Speech should be **permanent.** Nobody — not a company, not a government, not me — should be able to reach into your history and quietly erase what you said.

Speech should be **verifiable.** Anyone should be able to check that you said a thing, when you said it, and that it hasn't been tampered with. No "trust us." Proof.

Speech should be **anonymous by default.** Identity should be a choice you make, not a tax you pay to be allowed in the door. The right to speak without naming yourself is not a loophole. It's how the truth survives in places where naming yourself gets you hurt.

Speech should be **permissionless.** No gatekeeper deciding who is allowed to publish. No application form. No authority that can revoke the ability to be heard.

These aren't features. They're the whole point.

## How Elno embodies it

Elno is a fully on-chain social network on Solana. Every post is a Solana transaction — an event emitted by an open Anchor program living at `EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX`. The IDL is published on-chain, so any block explorer can decode exactly what happened. Your words are public, verifiable, permanent, and readable from any explorer or indexer on earth. No company server owns your feed, because there is no company server holding your feed.

Here's how the beliefs turn into machinery:

**You own your posts.** They're on-chain. I can't edit them. I can't hide them. I can't shadowban you, because there's no central feed for me to bury you in. An "edit" or "delete" on Elno is just another honest event the indexer interprets — the original is still there, forever. Nothing is secretly rewritten. Even erasing is done in the open.

**You're anonymous by default.** No email. No phone. No KYC. The app generates a wallet in your browser, encrypts it locally — AES-GCM, a non-extractable key, stored in IndexedDB — and that private key *never leaves your device and is never sent to any server.* Your key is your identity and your login. Paste it to sign in from anywhere, or import it into Phantom or Solflare. There is no list of who you are, because nobody ever collected one.

**Nobody can post as you, and nobody can post for you.** Every transaction is signed on your device with your key. There's a small signer backend that builds unsigned transactions, proxies RPC reads, and co-signs the one authority-gated step — claiming a unique username. It never touches your private key. It cannot impersonate you. The most power any authority has over your *words* is this: it can freeze a profile from posting new content (`set_profile_status`), and it sets fees. That's the ceiling. It cannot write a single word in your name, and it cannot unwrite one you've already published — and dissolving even that freeze power is on the roadmap.

**It's permissionless for real.** The instructions are open — `elnopost`, `elnoreply`, `elnoquote`, `elnoedit`, `elnodelete`, `elnofollow`. You can post straight to the program from your own machine and never touch my website. The website is just one client. If I disappeared tomorrow, the program would keep running and you'd keep posting. That's the test of whether something is actually yours: does it survive its creator walking away. Elno does.

**It's deliberately calm.** Only Reply and Quote exist. No likes. No reposts. No save button. No vanity counters. No engagement algorithm deciding what you're allowed to feel today. I left those out on purpose. The machinery of outrage is not a law of nature — it's a design choice, and I chose against it. Elno is a place to *say things*, not a slot machine for dopamine.

**It's cheap enough to be free.** A post is an event, not a stored account — roughly 5000 lamports, a fraction of a cent. Usernames cost nothing right now beyond a little account rent. Ownership of your own voice should not require a subscription.

## Who this is for

Elno is for anyone who wants to speak without a landlord.

The person who's been silently throttled and can feel it but can't prove it. The builder who wants their words to outlive the platform they typed them into. Anyone who's watched an account with years of history vanish in a notification and thought: that could be me, and there's nothing I could do.

And it's for the people who need it most — the ones for whom "just use your real name" is not a minor inconvenience but a genuine danger. Journalists. Dissidents. Whistleblowers. People living under regimes that treat a sentence as a sentence. The whole reason anonymity and censorship-resistance matter isn't to protect trolls. It's to protect the ones who tell the truth in places where the truth is illegal. A tool that only works when speech is already safe isn't worth building. Elno is built for when it isn't.

## What's true and what's coming

I'm going to be honest with you, because a manifesto that lies is just marketing.

Right now, today, on Solana mainnet: text posts, replies, quotes, edits, deletes, follow and unfollow, on-chain profiles, username transfer, self-custody key login, the IDL on-chain. It works, end to end.

Planned, and not done yet — I won't pretend otherwise: a public indexer and a real timeline that reads on-chain events; images and video; NFT profile photos wired into the UI; private, end-to-end encrypted messaging; mobile apps; multiple independent indexers and third-party clients on the same program so no single client — including mine — is a point of control; social recovery; and an open-source release on GitHub so you don't have to take my word for any of this.

There is no token. I'm not selling you one. If anyone ever tells you Elno has a coin to buy, they're lying.

## Why I bothered

I don't think a piece of software makes the world free. People do that.

But I do think the tools we use shape what we're able to say, and to whom, and whether it lasts. For twenty years we built the public square on rented land and acted surprised when the landlords started evicting people. We can build it on ground nobody owns. The technology to do it finally exists. The only thing missing was the will to make it calm, honest, and yours.

So I built Elno. Your key, your voice, your words — on a ledger no one can quietly edit, under a name no one can demand, in a square no one can lock you out of.

Speak freely. For real this time.

— Elno
