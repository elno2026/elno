export const LAMPORTS_PER_SOL = 1_000_000_000n
export const DEFAULT_REGISTRATION_PRICE_USD = '1'
export const DEFAULT_SOL_USD_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'

export async function resolveRegistrationFeeLamports(env = process.env) {
  const explicitLamports = env.OSOCIAL_REGISTRATION_FEE_LAMPORTS
  if (explicitLamports !== undefined && explicitLamports !== '') {
    assertIntegerString(explicitLamports, 'OSOCIAL_REGISTRATION_FEE_LAMPORTS')
    return {
      feeLamports: BigInt(explicitLamports),
      mode: 'lamports',
      priceUsd: null,
      solUsd: null,
      priceSource: 'OSOCIAL_REGISTRATION_FEE_LAMPORTS',
    }
  }

  const priceUsd = env.OSOCIAL_REGISTRATION_PRICE_USD || env.OSOCIAL_USERNAME_PRICE_USD || DEFAULT_REGISTRATION_PRICE_USD
  const solUsd = env.OSOCIAL_SOL_USD || await fetchSolUsd(env)
  const feeLamports = usdToLamports(priceUsd, solUsd)

  return {
    feeLamports,
    mode: 'usd',
    priceUsd,
    solUsd,
    priceSource: env.OSOCIAL_SOL_USD ? 'OSOCIAL_SOL_USD' : (env.OSOCIAL_SOL_PRICE_URL || DEFAULT_SOL_USD_PRICE_URL),
  }
}

export function usdToLamports(usd, solUsd) {
  const usdScaled = decimalToScaled(usd, 6, 'USD price')
  const solUsdScaled = decimalToScaled(solUsd, 6, 'SOL/USD price')
  if (usdScaled <= 0n) throw new Error('USD price must be greater than 0.')
  if (solUsdScaled <= 0n) throw new Error('SOL/USD price must be greater than 0.')
  return divideRoundUp(usdScaled * LAMPORTS_PER_SOL, solUsdScaled)
}

export function formatUsd(value) {
  const asNumber = Number(value)
  if (Number.isFinite(asNumber)) {
    return `$${asNumber.toLocaleString(undefined, { minimumFractionDigits: asNumber % 1 === 0 ? 0 : 2, maximumFractionDigits: 4 })}`
  }
  return `$${value}`
}

async function fetchSolUsd(env) {
  const url = env.OSOCIAL_SOL_PRICE_URL || DEFAULT_SOL_USD_PRICE_URL
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Could not fetch SOL/USD price: ${response.status}`)
  const payload = await response.json()
  const price = payload?.solana?.usd ?? payload?.SOL?.USD ?? payload?.solUsd
  if (price === undefined || price === null || price === '') {
    throw new Error('SOL/USD price response did not include solana.usd.')
  }
  return String(price)
}

function assertIntegerString(value, label) {
  if (!/^\d+$/.test(String(value))) throw new Error(`Set ${label} to a non-negative lamport amount.`)
}

function decimalToScaled(value, decimals, label) {
  const raw = String(value || '').trim()
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`${label} must be a positive decimal number.`)
  const [whole, fraction = ''] = raw.split('.')
  const scale = 10n ** BigInt(decimals)
  const padded = `${fraction}${'0'.repeat(decimals)}`.slice(0, decimals)
  return BigInt(whole) * scale + BigInt(padded || '0')
}

function divideRoundUp(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator
}

