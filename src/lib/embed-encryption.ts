import crypto from 'crypto'

// Use env var on prod for extra security, but fallback to static key everywhere else
// This allows embeds to work across all environments without requiring matching env vars
const ENCRYPTION_KEY = process.env.EMBED_ENCRYPTION_KEY || 'phub-embed-static-key-2024'

// Ensure key is 32 bytes for aes-256-cbc
const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()

// Use a fixed IV (initialization vector) so the same ID always produces the same encrypted output
// This is safe here because we're encrypting IDs, not sensitive data that needs randomness
const FIXED_IV = crypto.createHash('sha256').update('phub-embed-iv-static').digest().slice(0, 16)

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
  const cipher = crypto.createCipheriv('aes-256-cbc', key, FIXED_IV)
  let encrypted = cipher.update(embedId, 'utf-8', 'hex')
  encrypted += cipher.final('hex')

  // Return URL-safe base64 (no IV since it's fixed)
  const base64 = Buffer.from(encrypted, 'hex').toString('base64')
  return toUrlSafeBase64(base64)
}

export function decryptEmbedId(encryptedId: string): string | null {
  const decryptWithKey = (keyToUse: Buffer): string | null => {
    try {
      const base64 = fromUrlSafeBase64(encryptedId)
      const encrypted = Buffer.from(base64, 'base64').toString('hex')
      const decipher = crypto.createDecipheriv('aes-256-cbc', keyToUse, FIXED_IV)
      let decrypted = decipher.update(encrypted, 'hex', 'utf-8')
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
