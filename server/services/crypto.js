import crypto from 'crypto'

const APP_SECRET = process.env.APP_SECRET || 'default-secret-change-in-production'

// Ensure APP_SECRET is at least 32 bytes for AES-256
const encryptionKey = crypto
  .createHash('sha256')
  .update(APP_SECRET)
  .digest()

export function encryptToken(token) {
  if (!token) return null
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv)
  
  let encrypted = cipher.update(token, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  return iv.toString('hex') + ':' + encrypted
}

export function decryptToken(encryptedToken) {
  if (!encryptedToken) return null
  const [iv, encrypted] = encryptedToken.split(':')
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    encryptionKey,
    Buffer.from(iv, 'hex')
  )
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

export function decryptTokenSafely(encryptedToken) {
  if (!encryptedToken) return null
  if (!encryptedToken.includes(':')) {
    return encryptedToken
  }
  try {
    const [iv, encrypted] = encryptedToken.split(':')
    if (iv.length !== 32) {
      return encryptedToken
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      encryptionKey,
      Buffer.from(iv, 'hex')
    )
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (err) {
    console.warn('Decryption failed, using raw fallback token')
    return encryptedToken
  }
}

export default {
  encryptToken,
  decryptToken,
  decryptTokenSafely
}
