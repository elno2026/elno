use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;
use anchor_lang::system_program::{self, Transfer};

declare_id!("EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX");

pub const EXPECTED_PLATFORM_AUTHORITY: Pubkey = pubkey!("89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF");
pub const EXPECTED_TREASURY: Pubkey = pubkey!("89EvL1MAom5V2nBp5ucvDVgeVm8hRUUJNe9sDgub5HXF");
pub const MAX_HANDLE_BYTES: usize = 32;
pub const MIN_USERNAME_BYTES: usize = 3;
pub const MAX_USERNAME_BYTES: usize = 30;
pub const MAX_DISPLAY_NAME_BYTES: usize = 64;
pub const MAX_STORED_POST_PACKET_BYTES: usize = 512;
pub const MAX_EVENT_POST_PACKET_BYTES: usize = 1024;
pub const MAX_REGISTRATION_FEE_LAMPORTS: u64 = 1_000_000_000;
// Parent reference: buffer for the tx signature (base58 ~88 bytes) of the quoted/replied post.
pub const MAX_POST_REF_BYTES: usize = 96;
// Profile meta (event-based, does not touch the account): upper limits for bio + avatar.
pub const MAX_BIO_BYTES: usize = 280;
pub const MAX_AVATAR_BYTES: usize = 200;

#[program]
pub mod osocial_registry {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, registration_fee_lamports: u64) -> Result<()> {
        require_platform_authority(ctx.accounts.authority.key())?;
        require_expected_treasury(ctx.accounts.treasury.key())?;
        require!(registration_fee_lamports <= MAX_REGISTRATION_FEE_LAMPORTS, RegistryError::RegistrationFeeTooHigh);

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = ctx.accounts.treasury.key();
        config.registration_fee_lamports = registration_fee_lamports;
        config.bump = ctx.bumps.config;

        emit!(ConfigInitialized {
            authority: config.authority,
            treasury: config.treasury,
            registration_fee_lamports,
        });

        Ok(())
    }

    pub fn set_authority(ctx: Context<SetAuthority>, new_authority: Pubkey) -> Result<()> {
        require_platform_authority(ctx.accounts.authority.key())?;
        require_keys_eq!(new_authority, EXPECTED_PLATFORM_AUTHORITY, RegistryError::InvalidAuthority);
        let config = &mut ctx.accounts.config;
        let previous_authority = config.authority;
        config.authority = new_authority;

        emit!(AuthorityUpdated {
            previous_authority,
            new_authority,
        });

        Ok(())
    }

    pub fn set_treasury(ctx: Context<SetTreasury>, new_treasury: Pubkey) -> Result<()> {
        require_platform_authority(ctx.accounts.authority.key())?;
        require_expected_treasury(new_treasury)?;
        let config = &mut ctx.accounts.config;
        let previous_treasury = config.treasury;
        config.treasury = new_treasury;

        emit!(TreasuryUpdated {
            authority: ctx.accounts.authority.key(),
            previous_treasury,
            new_treasury,
        });

        Ok(())
    }

    pub fn set_registration_fee(ctx: Context<SetRegistrationFee>, registration_fee_lamports: u64) -> Result<()> {
        require_platform_authority(ctx.accounts.authority.key())?;
        require!(registration_fee_lamports <= MAX_REGISTRATION_FEE_LAMPORTS, RegistryError::RegistrationFeeTooHigh);
        let config = &mut ctx.accounts.config;
        config.registration_fee_lamports = registration_fee_lamports;

        emit!(RegistrationFeeUpdated {
            authority: ctx.accounts.authority.key(),
            registration_fee_lamports,
        });

        Ok(())
    }

    pub fn register_profile(ctx: Context<RegisterProfile>, handle: String, display_name: String) -> Result<()> {
        require_platform_authority(ctx.accounts.authority.key())?;
        validate_handle(&handle)?;
        require!(handle.as_bytes().len() <= MAX_HANDLE_BYTES, RegistryError::HandleTooLong);
        require!(
            display_name.as_bytes().len() <= MAX_DISPLAY_NAME_BYTES,
            RegistryError::DisplayNameTooLong
        );
        require_keys_eq!(
            ctx.accounts.config.treasury,
            ctx.accounts.treasury.key(),
            RegistryError::InvalidTreasury
        );
        require_expected_treasury(ctx.accounts.treasury.key())?;

        let fee = ctx.accounts.config.registration_fee_lamports;
        if fee > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.user.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        let profile = &mut ctx.accounts.profile;
        profile.owner = ctx.accounts.user.key();
        profile.handle = handle;
        profile.display_name = display_name;
        let created_at = Clock::get()?.unix_timestamp;
        profile.created_at = created_at;
        profile.paid_lamports = fee;
        profile.post_count = 0;
        profile.active = true;
        profile.bump = ctx.bumps.profile;

        let handle_claim = &mut ctx.accounts.handle_claim;
        handle_claim.owner = profile.owner;
        handle_claim.profile = profile.key();
        handle_claim.handle = profile.handle.clone();
        handle_claim.bump = ctx.bumps.handle_claim;

        emit!(ProfileRegistered {
            owner: profile.owner,
            authority: ctx.accounts.authority.key(),
            profile: profile.key(),
            handle: profile.handle.clone(),
            paid_lamports: fee,
        });

        emit!(UsernameClaimed {
            event_version: 1,
            owner: profile.owner,
            authority: ctx.accounts.authority.key(),
            treasury: ctx.accounts.treasury.key(),
            profile: profile.key(),
            username_index: handle_claim.key(),
            handle: profile.handle.clone(),
            display_name: profile.display_name.clone(),
            paid_lamports: fee,
            created_at,
        });

        Ok(())
    }

    pub fn create_post(ctx: Context<CreatePost>, packet: String) -> Result<()> {
        require_platform_authority(ctx.accounts.authority.key())?;
        require!(!packet.trim().is_empty(), RegistryError::EmptyPost);
        require!(
            packet.as_bytes().len() <= MAX_STORED_POST_PACKET_BYTES,
            RegistryError::PostPacketTooLong
        );

        let profile = &mut ctx.accounts.profile;
        require!(profile.active, RegistryError::ProfileDisabled);
        let post = &mut ctx.accounts.post;
        let sequence = profile.post_count;

        post.owner = ctx.accounts.user.key();
        post.profile = profile.key();
        post.sequence = sequence;
        post.packet = packet;
        post.created_at = Clock::get()?.unix_timestamp;
        post.bump = ctx.bumps.post;

        profile.post_count = profile
            .post_count
            .checked_add(1)
            .ok_or(RegistryError::PostCounterOverflow)?;

        emit!(PostCreated {
            owner: post.owner,
            authority: ctx.accounts.authority.key(),
            profile: post.profile,
            post: post.key(),
            sequence,
        });

        Ok(())
    }

    pub fn create_post_packet(ctx: Context<CreatePostPacket>, packet: String) -> Result<()> {
        let owner = ctx.accounts.user.key();
        let profile = &mut ctx.accounts.profile;
        let (sequence, created_at) = bump_post_counter(profile, &packet)?;
        emit!(PostPacketCreated { owner, profile: profile.key(), sequence, packet, created_at });
        Ok(())
    }

    // Plain post (formerly osocial_post). Cheap event-post path.
    pub fn elnopost(ctx: Context<ElnoPost>, packet: String) -> Result<()> {
        let owner = ctx.accounts.user.key();
        let profile = &mut ctx.accounts.profile;
        let (sequence, created_at) = bump_post_counter(profile, &packet)?;
        emit!(PostPacketCreated { owner, profile: profile.key(), sequence, packet, created_at });
        Ok(())
    }

    // Reply: a response to a post. reply_to = reference of the replied post (tx signature).
    pub fn elnoreply(ctx: Context<ElnoPost>, packet: String, reply_to: String) -> Result<()> {
        validate_ref(&reply_to)?;
        let owner = ctx.accounts.user.key();
        let profile = &mut ctx.accounts.profile;
        let (sequence, created_at) = bump_post_counter(profile, &packet)?;
        emit!(ReplyCreated { owner, profile: profile.key(), sequence, packet, reply_to, created_at });
        Ok(())
    }

    // Quote: share a post with your own comment. quote_of = reference of the quoted post.
    pub fn elnoquote(ctx: Context<ElnoPost>, packet: String, quote_of: String) -> Result<()> {
        validate_ref(&quote_of)?;
        let owner = ctx.accounts.user.key();
        let profile = &mut ctx.accounts.profile;
        let (sequence, created_at) = bump_post_counter(profile, &packet)?;
        emit!(QuoteCreated { owner, profile: profile.key(), sequence, packet, quote_of, created_at });
        Ok(())
    }

    // Edit: a new event pointing at the original via edit_of. post_count DOES NOT increase (not a new post).
    // Authorization is in the indexer: only edits where editor == original author are accepted.
    pub fn elnoedit(ctx: Context<ElnoPost>, packet: String, edit_of: String) -> Result<()> {
        require!(!packet.trim().is_empty(), RegistryError::EmptyPost);
        require!(
            packet.as_bytes().len() <= MAX_EVENT_POST_PACKET_BYTES,
            RegistryError::PostPacketTooLong
        );
        require!(ctx.accounts.profile.active, RegistryError::ProfileDisabled);
        validate_ref(&edit_of)?;

        emit!(EditCreated {
            owner: ctx.accounts.user.key(),
            profile: ctx.accounts.profile.key(),
            packet,
            edit_of,
            created_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    // Delete: tombstone event. Does not remove from the chain; the indexer hides the target post. post_count DOES NOT increase.
    pub fn elnodelete(ctx: Context<ElnoPost>, target: String) -> Result<()> {
        require!(ctx.accounts.profile.active, RegistryError::ProfileDisabled);
        validate_ref(&target)?;

        emit!(DeleteCreated {
            owner: ctx.accounts.user.key(),
            profile: ctx.accounts.profile.key(),
            target,
            created_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    // Follow: creates a Follow PDA (double-following is prevented by init).
    pub fn elnofollow(ctx: Context<ElnoFollow>, following: Pubkey) -> Result<()> {
        require_keys_neq!(ctx.accounts.user.key(), following, RegistryError::CannotFollowSelf);

        let created_at = Clock::get()?.unix_timestamp;
        let follow = &mut ctx.accounts.follow;
        follow.follower = ctx.accounts.user.key();
        follow.following = following;
        follow.created_at = created_at;
        follow.bump = ctx.bumps.follow;

        emit!(FollowCreated {
            follower: follow.follower,
            following,
            created_at,
        });
        Ok(())
    }

    // Unfollow: closes the Follow PDA, rent is refunded to the user.
    pub fn elnounfollow(ctx: Context<ElnoUnfollow>, following: Pubkey) -> Result<()> {
        emit!(FollowRemoved {
            follower: ctx.accounts.user.key(),
            following,
            created_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    // Edit profile: display name + bio + avatar. Event-based — it DOES NOT MODIFY the Profile account,
    // so existing on-chain profiles are not broken. The indexer shows the latest meta event.
    // avatar: can be a normal image URL or an "nft:<mint>" reference (see elnopfp for NFTs).
    pub fn elnoprofile(
        ctx: Context<ElnoPost>,
        display_name: String,
        bio: String,
        avatar: String,
    ) -> Result<()> {
        require!(ctx.accounts.profile.active, RegistryError::ProfileDisabled);
        require!(
            display_name.as_bytes().len() <= MAX_DISPLAY_NAME_BYTES,
            RegistryError::DisplayNameTooLong
        );
        require!(bio.as_bytes().len() <= MAX_BIO_BYTES, RegistryError::BioTooLong);
        require!(avatar.as_bytes().len() <= MAX_AVATAR_BYTES, RegistryError::AvatarTooLong);

        emit!(ProfileMetaUpdated {
            owner: ctx.accounts.user.key(),
            profile: ctx.accounts.profile.key(),
            display_name,
            bio,
            avatar,
            created_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    // NFT profile picture (PFP). nft_mint = the mint address of the NFT to be used as the avatar.
    // owner_wallet = the main wallet holding the NFT (NFTs are not in the app device wallet, they live
    // in the user's real/recovery wallet). The indexer VERIFIES: is owner_wallet linked to this account +
    // does it actually own that NFT (RPC). If ownership changes (NFT transfer), the indexer removes the hexagon.
    pub fn elnopfp(ctx: Context<ElnoPost>, nft_mint: Pubkey, owner_wallet: Pubkey) -> Result<()> {
        require!(ctx.accounts.profile.active, RegistryError::ProfileDisabled);

        emit!(PfpSet {
            owner: ctx.accounts.user.key(),
            profile: ctx.accounts.profile.key(),
            nft_mint,
            owner_wallet,
            created_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn update_profile(ctx: Context<UpdateProfile>, display_name: String) -> Result<()> {
        require_platform_authority(ctx.accounts.authority.key())?;
        require!(
            display_name.as_bytes().len() <= MAX_DISPLAY_NAME_BYTES,
            RegistryError::DisplayNameTooLong
        );

        let profile = &mut ctx.accounts.profile;
        require!(profile.active, RegistryError::ProfileDisabled);
        profile.display_name = display_name;

        emit!(ProfileUpdated {
            owner: profile.owner,
            authority: ctx.accounts.authority.key(),
            profile: profile.key(),
            handle: profile.handle.clone(),
        });

        Ok(())
    }

    pub fn set_profile_status(ctx: Context<SetProfileStatus>, active: bool) -> Result<()> {
        require_platform_authority(ctx.accounts.authority.key())?;
        let profile = &mut ctx.accounts.profile;
        profile.active = active;

        emit!(ProfileStatusUpdated {
            owner: profile.owner,
            authority: ctx.accounts.authority.key(),
            profile: profile.key(),
            active,
        });

        Ok(())
    }

    // Username TRANSFER: the handle owner moves it to another wallet (sale/transfer/marketplace).
    // HandleClaim = ownership record; only the current owner can sign. The indexer resolves the profile display.
    pub fn transfer_handle(ctx: Context<TransferHandle>, new_owner: Pubkey) -> Result<()> {
        require_keys_neq!(new_owner, Pubkey::default(), RegistryError::InvalidNewOwner);
        let claim = &mut ctx.accounts.handle_claim;
        let previous_owner = claim.owner;
        require_keys_neq!(new_owner, previous_owner, RegistryError::InvalidNewOwner);
        claim.owner = new_owner;

        emit!(HandleTransferred {
            handle: claim.handle.clone(),
            handle_claim: claim.key(),
            previous_owner,
            new_owner,
            created_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

// Shared by post/reply/quote: validate the packet, increment the counter, return (sequence, created_at).
fn bump_post_counter(profile: &mut Account<Profile>, packet: &str) -> Result<(u64, i64)> {
    require!(!packet.trim().is_empty(), RegistryError::EmptyPost);
    require!(
        packet.as_bytes().len() <= MAX_EVENT_POST_PACKET_BYTES,
        RegistryError::PostPacketTooLong
    );
    require!(profile.active, RegistryError::ProfileDisabled);

    let sequence = profile.post_count;
    let created_at = Clock::get()?.unix_timestamp;
    profile.post_count = profile
        .post_count
        .checked_add(1)
        .ok_or(RegistryError::PostCounterOverflow)?;

    Ok((sequence, created_at))
}

// Validate the reply/quote parent reference (cannot be empty, upper limit).
fn validate_ref(reference: &str) -> Result<()> {
    let bytes = reference.as_bytes();
    require!(!bytes.is_empty(), RegistryError::EmptyRef);
    require!(bytes.len() <= MAX_POST_REF_BYTES, RegistryError::RefTooLong);
    Ok(())
}

fn require_platform_authority(authority: Pubkey) -> Result<()> {
    require_keys_eq!(authority, EXPECTED_PLATFORM_AUTHORITY, RegistryError::Unauthorized);
    Ok(())
}

fn require_expected_treasury(treasury: Pubkey) -> Result<()> {
    require_keys_eq!(treasury, EXPECTED_TREASURY, RegistryError::InvalidTreasury);
    Ok(())
}

fn validate_handle(handle: &str) -> Result<()> {
    let bytes = handle.as_bytes();
    require!(!bytes.is_empty(), RegistryError::EmptyHandle);
    require!(bytes.len() >= MIN_USERNAME_BYTES, RegistryError::HandleTooShort);
    require!(bytes.len() <= MAX_USERNAME_BYTES && bytes.len() <= MAX_HANDLE_BYTES, RegistryError::HandleTooLong);
    require!(
        bytes.iter().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'_' || *byte == b'.'),
        RegistryError::InvalidHandle
    );
    require!(
        bytes.first().is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
            && bytes.last().is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit()),
        RegistryError::InvalidHandle
    );
    require!(
        !bytes.windows(2).any(|pair| (pair[0] == b'_' || pair[0] == b'.') && (pair[1] == b'_' || pair[1] == b'.')),
        RegistryError::InvalidHandle
    );
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = RegistryConfig::SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, RegistryConfig>,
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetRegistrationFee<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized
    )]
    pub config: Account<'info, RegistryConfig>,
}

#[derive(Accounts)]
pub struct SetAuthority<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized
    )]
    pub config: Account<'info, RegistryConfig>,
}

#[derive(Accounts)]
pub struct SetTreasury<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized
    )]
    pub config: Account<'info, RegistryConfig>,
}

#[derive(Accounts)]
#[instruction(handle: String, display_name: String)]
pub struct RegisterProfile<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(
        init,
        payer = user,
        space = Profile::SPACE,
        seeds = [b"profile", user.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, Profile>,
    #[account(
        init,
        payer = user,
        space = HandleClaim::SPACE,
        seeds = [b"handle", handle.as_bytes()],
        bump
    )]
    pub handle_claim: Account<'info, HandleClaim>,
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePost<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(
        mut,
        seeds = [b"profile", user.key().as_ref()],
        bump = profile.bump,
        constraint = profile.owner == user.key() @ RegistryError::Unauthorized
    )]
    pub profile: Account<'info, Profile>,
    #[account(
        init,
        payer = user,
        space = Post::SPACE,
        seeds = [b"post", user.key().as_ref(), profile.post_count.to_le_bytes().as_ref()],
        bump
    )]
    pub post: Account<'info, Post>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePostPacket<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"profile", user.key().as_ref()],
        bump = profile.bump,
        constraint = profile.owner == user.key() @ RegistryError::Unauthorized
    )]
    pub profile: Account<'info, Profile>,
}

// elnopost / elnoreply / elnoquote / elnoedit / elnodelete use the same accounts: user (signer) + their own profile.
#[derive(Accounts)]
pub struct ElnoPost<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"profile", user.key().as_ref()],
        bump = profile.bump,
        constraint = profile.owner == user.key() @ RegistryError::Unauthorized
    )]
    pub profile: Account<'info, Profile>,
}

#[derive(Accounts)]
#[instruction(following: Pubkey)]
pub struct ElnoFollow<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init,
        payer = user,
        space = Follow::SPACE,
        seeds = [b"follow", user.key().as_ref(), following.as_ref()],
        bump
    )]
    pub follow: Account<'info, Follow>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(following: Pubkey)]
pub struct ElnoUnfollow<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        close = user,
        seeds = [b"follow", user.key().as_ref(), following.as_ref()],
        bump = follow.bump,
        constraint = follow.follower == user.key() @ RegistryError::Unauthorized
    )]
    pub follow: Account<'info, Follow>,
}

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    pub owner: Signer<'info>,
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(
        mut,
        seeds = [b"profile", owner.key().as_ref()],
        bump = profile.bump,
        has_one = owner @ RegistryError::Unauthorized
    )]
    pub profile: Account<'info, Profile>,
}

#[derive(Accounts)]
pub struct SetProfileStatus<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized
    )]
    pub config: Account<'info, RegistryConfig>,
    /// CHECK: only used as the profile PDA seed and matched by profile.has_one.
    pub owner: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"profile", owner.key().as_ref()],
        bump = profile.bump,
        has_one = owner @ RegistryError::Unauthorized
    )]
    pub profile: Account<'info, Profile>,
}

#[derive(Accounts)]
pub struct TransferHandle<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"handle", handle_claim.handle.as_bytes()],
        bump = handle_claim.bump,
        constraint = handle_claim.owner == owner.key() @ RegistryError::Unauthorized
    )]
    pub handle_claim: Account<'info, HandleClaim>,
}

#[account]
pub struct RegistryConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub registration_fee_lamports: u64,
    pub bump: u8,
}

impl RegistryConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

#[account]
pub struct Profile {
    pub owner: Pubkey,
    pub handle: String,
    pub display_name: String,
    pub created_at: i64,
    pub paid_lamports: u64,
    pub post_count: u64,
    pub active: bool,
    pub bump: u8,
}

impl Profile {
    pub const SPACE: usize = 8 + 32 + (4 + MAX_HANDLE_BYTES) + (4 + MAX_DISPLAY_NAME_BYTES) + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct HandleClaim {
    pub owner: Pubkey,
    pub profile: Pubkey,
    pub handle: String,
    pub bump: u8,
}

impl HandleClaim {
    pub const SPACE: usize = 8 + 32 + 32 + (4 + MAX_HANDLE_BYTES) + 1;
}

#[account]
pub struct Post {
    pub owner: Pubkey,
    pub profile: Pubkey,
    pub sequence: u64,
    pub packet: String,
    pub created_at: i64,
    pub bump: u8,
}

impl Post {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + (4 + MAX_STORED_POST_PACKET_BYTES) + 8 + 1;
}

#[account]
pub struct Follow {
    pub follower: Pubkey,
    pub following: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}

impl Follow {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub registration_fee_lamports: u64,
}

#[event]
pub struct RegistrationFeeUpdated {
    pub authority: Pubkey,
    pub registration_fee_lamports: u64,
}

#[event]
pub struct AuthorityUpdated {
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct TreasuryUpdated {
    pub authority: Pubkey,
    pub previous_treasury: Pubkey,
    pub new_treasury: Pubkey,
}

#[event]
pub struct ProfileRegistered {
    pub owner: Pubkey,
    pub authority: Pubkey,
    pub profile: Pubkey,
    pub handle: String,
    pub paid_lamports: u64,
}

#[event]
pub struct UsernameClaimed {
    pub event_version: u8,
    pub owner: Pubkey,
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub profile: Pubkey,
    pub username_index: Pubkey,
    pub handle: String,
    pub display_name: String,
    pub paid_lamports: u64,
    pub created_at: i64,
}

#[event]
pub struct PostCreated {
    pub owner: Pubkey,
    pub authority: Pubkey,
    pub profile: Pubkey,
    pub post: Pubkey,
    pub sequence: u64,
}

#[event]
pub struct PostPacketCreated {
    pub owner: Pubkey,
    pub profile: Pubkey,
    pub sequence: u64,
    pub packet: String,
    pub created_at: i64,
}

#[event]
pub struct ReplyCreated {
    pub owner: Pubkey,
    pub profile: Pubkey,
    pub sequence: u64,
    pub packet: String,
    pub reply_to: String,
    pub created_at: i64,
}

#[event]
pub struct QuoteCreated {
    pub owner: Pubkey,
    pub profile: Pubkey,
    pub sequence: u64,
    pub packet: String,
    pub quote_of: String,
    pub created_at: i64,
}

#[event]
pub struct EditCreated {
    pub owner: Pubkey,
    pub profile: Pubkey,
    pub packet: String,
    pub edit_of: String,
    pub created_at: i64,
}

#[event]
pub struct DeleteCreated {
    pub owner: Pubkey,
    pub profile: Pubkey,
    pub target: String,
    pub created_at: i64,
}

#[event]
pub struct FollowCreated {
    pub follower: Pubkey,
    pub following: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct FollowRemoved {
    pub follower: Pubkey,
    pub following: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct ProfileMetaUpdated {
    pub owner: Pubkey,
    pub profile: Pubkey,
    pub display_name: String,
    pub bio: String,
    pub avatar: String,
    pub created_at: i64,
}

#[event]
pub struct PfpSet {
    pub owner: Pubkey,
    pub profile: Pubkey,
    pub nft_mint: Pubkey,
    pub owner_wallet: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct HandleTransferred {
    pub handle: String,
    pub handle_claim: Pubkey,
    pub previous_owner: Pubkey,
    pub new_owner: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct ProfileUpdated {
    pub owner: Pubkey,
    pub authority: Pubkey,
    pub profile: Pubkey,
    pub handle: String,
}

#[event]
pub struct ProfileStatusUpdated {
    pub owner: Pubkey,
    pub authority: Pubkey,
    pub profile: Pubkey,
    pub active: bool,
}

#[error_code]
pub enum RegistryError {
    #[msg("Only the registry authority can perform this action.")]
    Unauthorized,
    #[msg("The supplied treasury account does not match registry config.")]
    InvalidTreasury,
    #[msg("Authority cannot be the default pubkey.")]
    InvalidAuthority,
    #[msg("Handle cannot be empty.")]
    EmptyHandle,
    #[msg("Handle is too short.")]
    HandleTooShort,
    #[msg("Handle must be 3-30 lowercase ascii letters, digits, underscores, or dots, and separators cannot start, end, or repeat.")]
    InvalidHandle,
    #[msg("Handle is too long.")]
    HandleTooLong,
    #[msg("Display name is too long.")]
    DisplayNameTooLong,
    #[msg("Post packet cannot be empty.")]
    EmptyPost,
    #[msg("Post packet is too long.")]
    PostPacketTooLong,
    #[msg("Registration fee is too high.")]
    RegistrationFeeTooHigh,
    #[msg("Post counter overflow.")]
    PostCounterOverflow,
    #[msg("Profile is disabled by the registry authority.")]
    ProfileDisabled,
    #[msg("Reply/quote reference cannot be empty.")]
    EmptyRef,
    #[msg("Reply/quote reference is too long.")]
    RefTooLong,
    #[msg("A wallet cannot follow itself.")]
    CannotFollowSelf,
    #[msg("Bio is too long.")]
    BioTooLong,
    #[msg("Avatar reference is too long.")]
    AvatarTooLong,
    #[msg("New owner is invalid (default key or same as current owner).")]
    InvalidNewOwner,
}
