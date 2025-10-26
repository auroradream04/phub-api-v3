import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.EMBED_ENCRYPTION_KEY || 'default-unsafe-key-change-in-production'

// Ensure key is 32 bytes for aes-256-cbc
const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()

export function encryptEmbedId(embedId: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(embedId, 'utf-8', 'hex')
  encrypted += cipher.final('hex')

  // Combine IV and encrypted data, then base64 encode
  const combined = iv.toString('hex') + ':' + encrypted
  return Buffer.from(combined).toString('base64')
}

export function decryptEmbedId(encryptedId: string): string | null {
  try {
    const combined = Buffer.from(encryptedId, 'base64').toString('utf-8')
    const [ivHex, encrypted] = combined.split(':')

    if (!ivHex || !encrypted) return null

    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8')
    decrypted += decipher.final('utf-8')

    return decrypted
  } catch (error) {
    console.error('Error decrypting embed ID:', error)
    return null
  }
}
