import crypto from 'crypto'

// Use env var on prod for extra security, but fallback to static key everywhere else
// This allows embeds to work across all environments without requiring matching env vars
const ENCRYPTION_KEY = process.env.EMBED_ENCRYPTION_KEY || 'phub-embed-static-key-2024'

// Ensure key is 32 bytes for aes-256-cbc
const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()

function toUrlSafeBase64(base64: string): string {
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function fromUrlSafeBase64(urlSafeBase64: string): string {
  // Add back padding
  const padding = 4 - (urlSafeBase64.length % 4)
  let base64 = urlSafeBase64
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  if (padding !== 4) {
    base64 += '='.repeat(padding)
  }
  return base64
}

export function encryptEmbedId(embedId: string): string {
  // Generate random IV for each encryption
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(embedId, 'utf-8', 'hex')
  encrypted += cipher.final('hex')

  // Prepend IV to ciphertext (IV doesn't need to be secret, but needs to be random)
  const combined = iv.toString('hex') + encrypted
  const base64 = Buffer.from(combined, 'hex').toString('base64')
  return toUrlSafeBase64(base64)
}

export function decryptEmbedId(encryptedId: string): string | null {
  const decryptWithKey = (keyToUse: Buffer): string | null => {
    try {
      const base64 = fromUrlSafeBase64(encryptedId)
      const combined = Buffer.from(base64, 'base64').toString('hex')

      // Extract IV from first 32 hex chars (16 bytes = 32 hex chars)
      const ivHex = combined.slice(0, 32)
      const encryptedHex = combined.slice(32)

      if (ivHex.length !== 32 || encryptedHex.length === 0) {
        return null
      }

      const iv = Buffer.from(ivHex, 'hex')
      const decipher = crypto.createDecipheriv('aes-256-cbc', keyToUse, iv)
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf-8')
      decrypted += decipher.final('utf-8')
      return decrypted
    } catch {
      return null
    }
  }

  // Try with env var key first (prod key)
  let decrypted = decryptWithKey(key)
  if (decrypted) {
    console.log('[Embed] Successfully decrypted with env key', { encryptedId: encryptedId.substring(0, 20) + '...', decryptedId: decrypted })
    return decrypted
  }

  // Fallback to static key (allows local embeds to work on prod)
  const fallbackKey = crypto.createHash('sha256').update('phub-embed-static-key-2024').digest()
  decrypted = decryptWithKey(fallbackKey)
  if (decrypted) {
    console.log('[Embed] Successfully decrypted with fallback key', { encryptedId: encryptedId.substring(0, 20) + '...', decryptedId: decrypted })
    return decrypted
  }

  // Both keys failed
  console.warn('[Embed] Failed to decrypt ID with any key', { encryptedId: encryptedId.substring(0, 20) + '...' })
  return null
}
