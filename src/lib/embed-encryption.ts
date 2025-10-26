import crypto from 'crypto'

// Use a static key that's the same across all environments
// This ensures the same ID always encrypts/decrypts the same way
const ENCRYPTION_KEY = process.env.EMBED_ENCRYPTION_KEY || 'phub-embed-static-key-2024'

// Ensure key is 32 bytes for aes-256-cbc
const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()

// Use a fixed IV (initialization vector) so the same ID always produces the same encrypted output
// This is safe here because we're encrypting IDs, not sensitive data that needs randomness
const FIXED_IV = crypto.createHash('sha256').update('phub-embed-iv-static').digest().slice(0, 16)

export function encryptEmbedId(embedId: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, FIXED_IV)
  let encrypted = cipher.update(embedId, 'utf-8', 'hex')
  encrypted += cipher.final('hex')

  // Return just the encrypted data as base64 (no IV since it's fixed)
  return Buffer.from(encrypted, 'hex').toString('base64')
}

export function decryptEmbedId(encryptedId: string): string | null {
  try {
    const encrypted = Buffer.from(encryptedId, 'base64').toString('hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, FIXED_IV)
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8')
    decrypted += decipher.final('utf-8')

    return decrypted
  } catch (error) {
    console.error('Error decrypting embed ID:', error)
    return null
  }
}
