const enc = new TextEncoder()
const dec = new TextDecoder()

const V1_POST = 0x10
const V2_POST = 0x11
const FLAG_TEXT = 1 << 0
const FLAG_MEDIA = 1 << 1
const V1_BIN_PREFIX = 'osocial:v1:bin:'
const V2_BIN_PREFIX = 'osocial:v2:bin:'
const V0_JSON_PREFIX = 'osocial:v0:json:'
const V0_BR_PREFIX = 'osocial:v0:br:'
const ZERO_HASH = new Uint8Array(32)
const MEDIA_SOURCE_URL = 0
const MEDIA_SOURCE_OSOCIAL = 1
const MIME_TO_BYTE = new Map([
  ['image/png', 1],
  ['image/jpeg', 2],
  ['image/webp', 3],
  ['image/gif', 4],
  ['image/avif', 5],
  ['video/mp4', 16],
  ['video/webm', 17],
  ['video/quicktime', 18],
])
const BYTE_TO_MIME = new Map([...MIME_TO_BYTE].map(([mime, byte]) => [byte, mime]))
const MIME_TO_EXT = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
])

function byteLength(value) {
  return enc.encode(value).length
}

function base64Url(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunk))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function writeVarint(value, out) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('varint value must be a non-negative safe integer')
  let remaining = value
  while (remaining >= 0x80) {
    out.push((remaining & 0x7f) | 0x80)
    remaining = Math.floor(remaining / 0x80)
  }
  out.push(remaining)
}

function readVarint(bytes, cursor) {
  let result = 0
  let shift = 0
  let offset = cursor.offset

  while (offset < bytes.length) {
    const byte = bytes[offset++]
    result += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) {
      cursor.offset = offset
      return result
    }
    shift += 7
    if (shift > 49) throw new Error('varint is too large')
  }

  throw new Error('truncated varint')
}

function readBytes(bytes, cursor, length) {
  const end = cursor.offset + length
  if (end > bytes.length) throw new Error('truncated packet')
  const slice = bytes.slice(cursor.offset, end)
  cursor.offset = end
  return slice
}

function mediaKindByte(kind) {
  const clean = String(kind || '').toLowerCase()
  if (MIME_TO_BYTE.has(clean)) return MIME_TO_BYTE.get(clean)
  return 0
}

function legacyMediaKindByte(kind) {
  const clean = String(kind || '').toLowerCase()
  if (clean.startsWith('image/')) return 1
  if (clean.startsWith('video/')) return 2
  if (clean.startsWith('audio/')) return 3
  return 0
}

function mediaKindString(byte) {
  return BYTE_TO_MIME.get(byte) || (byte >= 16 ? 'video/*' : byte > 0 ? 'image/*' : 'application/octet-stream')
}

function legacyMediaKindString(byte) {
  if (byte === 1) return 'image/*'
  if (byte === 2) return 'video/*'
  if (byte === 3) return 'audio/*'
  return 'application/octet-stream'
}

function hashBytes(hash) {
  const clean = String(hash || '').trim().toLowerCase()
  const hex = clean.startsWith('sha256:') ? clean.slice('sha256:'.length) : ''
  if (!/^[0-9a-f]{64}$/.test(hex)) return ZERO_HASH
  return Uint8Array.from(hex.match(/.{2}/g).map((part) => Number.parseInt(part, 16)))
}

function hashString(bytes) {
  if (bytes.length !== 32 || bytes.every((byte) => byte === 0)) return ''
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

function hashHex(hash) {
  const clean = String(hash || '').trim().toLowerCase()
  return clean.startsWith('sha256:') && /^[0-9a-f]{64}$/.test(clean.slice(7)) ? clean.slice(7) : ''
}

function parseMediaId(value) {
  const match = String(value || '').match(/(?:^|\/)(?:media\/|m\/)?([a-f0-9]{64}\.[a-z0-9]+)(?:[?#].*)?$/i)
  if (!match) return null
  const id = match[1].toLowerCase()
  const ext = id.slice(id.lastIndexOf('.'))
  const kind = [...MIME_TO_EXT].find(([, knownExt]) => knownExt === ext)?.[0] || ''
  if (!kind) return null
  return { id, hash: `sha256:${id.slice(0, 64)}`, kind }
}

function mediaIdFromUrl(url) {
  return parseMediaId(url)?.id || ''
}

function mediaIdFromHash(kind, hash) {
  const hex = hashHex(hash)
  const ext = MIME_TO_EXT.get(String(kind || '').toLowerCase()) || ''
  return hex && ext ? `${hex}${ext}` : ''
}

function normalizedMediaItem(item) {
  const parsedId = parseMediaId(item.id || item.mediaId || item.url)
  const kind = MIME_TO_BYTE.has(String(item.kind || '').toLowerCase())
    ? String(item.kind).toLowerCase()
    : parsedId?.kind || ''
  const hash = hashHex(item.hash) ? item.hash.toLowerCase() : parsedId?.hash || ''
  const mediaId = parsedId?.id || mediaIdFromHash(kind, hash)
  const hosted = Boolean(mediaId && hashHex(hash))
  const url = item.url || ''

  return { kind, hash, mediaId, hosted, url }
}

function compactMediaItem(item) {
  const { kind, hash, mediaId, hosted, url } = normalizedMediaItem(item)

  if (hosted) {
    return {
      k: kind,
      i: mediaId,
      h: hash,
    }
  }

  return {
    k: kind,
    u: url,
    h: hash,
  }
}

export function encodeV1Post({ text = '', media = null } = {}) {
  const textBytes = enc.encode(text || '')
  const mediaItems = Array.isArray(media) ? media.filter((item) => item?.url) : media?.url ? [media] : []
  const out = [V1_POST]
  let flags = 0
  if (textBytes.length > 0) flags |= FLAG_TEXT
  if (mediaItems.length > 0) flags |= FLAG_MEDIA
  out.push(flags)

  if (flags & FLAG_TEXT) {
    writeVarint(textBytes.length, out)
    out.push(...textBytes)
  }

  if (flags & FLAG_MEDIA) {
    writeVarint(mediaItems.length, out)
    for (const item of mediaItems) {
      const urlBytes = enc.encode(item.url || '')
      out.push(legacyMediaKindByte(item.kind))
      writeVarint(urlBytes.length, out)
      out.push(...urlBytes)
      out.push(...hashBytes(item.hash))
    }
  }

  return Uint8Array.from(out)
}

export function encodeV2Post({ text = '', media = null } = {}) {
  const textBytes = enc.encode(text || '')
  const mediaItems = Array.isArray(media)
    ? media.filter((item) => item?.url || item?.id || item?.mediaId)
    : media?.url || media?.id || media?.mediaId
      ? [media]
      : []
  const out = [V2_POST]
  let flags = 0
  if (textBytes.length > 0) flags |= FLAG_TEXT
  if (mediaItems.length > 0) flags |= FLAG_MEDIA
  out.push(flags)

  if (flags & FLAG_TEXT) {
    writeVarint(textBytes.length, out)
    out.push(...textBytes)
  }

  if (flags & FLAG_MEDIA) {
    writeVarint(mediaItems.length, out)
    for (const item of mediaItems) {
      const { kind, hash, hosted, url } = normalizedMediaItem(item)
      const kindByte = mediaKindByte(kind)
      if (!kindByte) throw new Error('unsupported media type')
      if (!hosted && !url) throw new Error('media url or mediaId is required')
      out.push(kindByte)
      out.push(hosted ? MEDIA_SOURCE_OSOCIAL : MEDIA_SOURCE_URL)
      if (!hosted) {
        const urlBytes = enc.encode(url)
        writeVarint(urlBytes.length, out)
        out.push(...urlBytes)
      }
      out.push(...hashBytes(hash))
    }
  }

  return Uint8Array.from(out)
}

export function decodeV1PostBytes(bytes) {
  const cursor = { offset: 0 }
  if (bytes.length < 2) throw new Error('truncated packet')
  const versionKind = bytes[cursor.offset++]
  if (versionKind !== V1_POST) throw new Error('unsupported packet version/kind')

  const flags = bytes[cursor.offset++]
  const view = { v: 1, type: 'post', t: '', m: [] }

  if (flags & FLAG_TEXT) {
    const length = readVarint(bytes, cursor)
    view.t = dec.decode(readBytes(bytes, cursor, length))
  }

  if (flags & FLAG_MEDIA) {
    const count = readVarint(bytes, cursor)
    for (let i = 0; i < count; i += 1) {
      if (cursor.offset >= bytes.length) throw new Error('truncated packet')
      const kind = bytes[cursor.offset++]
      const urlLength = readVarint(bytes, cursor)
      const url = dec.decode(readBytes(bytes, cursor, urlLength))
      const hash = hashString(readBytes(bytes, cursor, 32))
      view.m.push({ k: legacyMediaKindString(kind), u: url, h: hash })
    }
  }

  if (cursor.offset !== bytes.length) throw new Error('packet has trailing bytes')
  return view
}

export function decodeV2PostBytes(bytes) {
  const cursor = { offset: 0 }
  if (bytes.length < 2) throw new Error('truncated packet')
  const versionKind = bytes[cursor.offset++]
  if (versionKind !== V2_POST) throw new Error('unsupported packet version/kind')

  const flags = bytes[cursor.offset++]
  const view = { v: 2, type: 'post', t: '', m: [] }

  if (flags & FLAG_TEXT) {
    const length = readVarint(bytes, cursor)
    view.t = dec.decode(readBytes(bytes, cursor, length))
  }

  if (flags & FLAG_MEDIA) {
    const count = readVarint(bytes, cursor)
    for (let i = 0; i < count; i += 1) {
      if (cursor.offset + 2 > bytes.length) throw new Error('truncated packet')
      const kindByte = bytes[cursor.offset++]
      const source = bytes[cursor.offset++]
      const kind = mediaKindString(kindByte)
      let url = ''
      if (source === MEDIA_SOURCE_URL) {
        const urlLength = readVarint(bytes, cursor)
        url = dec.decode(readBytes(bytes, cursor, urlLength))
      } else if (source !== MEDIA_SOURCE_OSOCIAL) {
        throw new Error('unsupported media source')
      }
      const hash = hashString(readBytes(bytes, cursor, 32))
      const id = source === MEDIA_SOURCE_OSOCIAL ? mediaIdFromHash(kind, hash) : ''
      view.m.push({ k: kind, u: url, i: id, h: hash, source: source === MEDIA_SOURCE_OSOCIAL ? 'osocial' : 'url' })
    }
  }

  if (cursor.offset !== bytes.length) throw new Error('packet has trailing bytes')
  return view
}

export function decodePacketMemo(memo, brotli) {
  if (memo.startsWith(V2_BIN_PREFIX)) {
    return decodeV2PostBytes(fromBase64Url(memo.slice(V2_BIN_PREFIX.length)))
  }

  if (memo.startsWith(V1_BIN_PREFIX)) {
    return decodeV1PostBytes(fromBase64Url(memo.slice(V1_BIN_PREFIX.length)))
  }

  if (memo.startsWith(V0_JSON_PREFIX)) {
    return JSON.parse(memo.slice(V0_JSON_PREFIX.length))
  }

  if (memo.startsWith(V0_BR_PREFIX) && brotli) {
    const compressed = fromBase64Url(memo.slice(V0_BR_PREFIX.length))
    return JSON.parse(dec.decode(brotli.decompress(compressed)))
  }

  return null
}

export function makePacket({ text, media, mode = 'bin', brotli }) {
  const mediaItems = Array.isArray(media)
    ? media.filter((item) => item?.url || item?.id || item?.mediaId)
    : media?.url || media?.id || media?.mediaId
      ? [media]
      : []
  const actualMode = mode === 'br' && !brotli ? 'bin' : mode
  const payload = {
    v: actualMode === 'bin' ? 2 : 0,
    type: 'post',
    t: text,
    m: mediaItems.map(compactMediaItem),
  }

  const json = JSON.stringify({ ...payload, v: 0 })
  const readableMemo = `${V0_JSON_PREFIX}${json}`
  const binary = encodeV2Post({ text, media })
  const binaryMemo = `${V2_BIN_PREFIX}${base64Url(binary)}`
  let brotliMemo = ''
  let brotliBytes = 0

  if (brotli) {
    const compressed = brotli.compress(enc.encode(json), { quality: 11 })
    brotliBytes = compressed.length
    brotliMemo = `${V0_BR_PREFIX}${base64Url(compressed)}`
  }

  const memo = actualMode === 'br' && brotliMemo ? brotliMemo : actualMode === 'json' ? readableMemo : binaryMemo

  return {
    payload,
    actualMode,
    readableMemo,
    brotliMemo,
    binaryMemo,
    memo,
    memoBytes: byteLength(memo),
    binaryBytes: binary.length,
    binaryMemoBytes: byteLength(binaryMemo),
    jsonBytes: byteLength(readableMemo),
    brotliBytes,
    brotliMemoBytes: brotliMemo ? byteLength(brotliMemo) : 0,
  }
}
