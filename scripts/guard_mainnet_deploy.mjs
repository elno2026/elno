const programId = process.env.OSOCIAL_PROGRAM_ID || 'EzkXptxPSfDUUsbHwfSkF7Buvca1RVPGohCPAVFeUHcX'
const authorityPath = process.env.OSOCIAL_UPGRADE_AUTHORITY_KEYPAIR || ''

if (process.env.OSOCIAL_CONFIRM_MAINNET !== programId) {
  throw new Error(`Refusing mainnet deploy. Set OSOCIAL_CONFIRM_MAINNET=${programId}.`)
}

if (!authorityPath) {
  throw new Error('Set OSOCIAL_UPGRADE_AUTHORITY_KEYPAIR to the protected upgrade authority keypair.')
}

if (/burner|mainnet-burner|devnet/i.test(authorityPath)) {
  throw new Error('Refusing to use a burner/dev key as mainnet upgrade authority.')
}

console.log(JSON.stringify({ ok: true, programId, upgradeAuthority: authorityPath }))
