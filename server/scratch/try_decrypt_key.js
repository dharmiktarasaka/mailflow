import mongoose from 'mongoose'
import crypto from 'crypto'
import { ApiKey } from '../db/models.js'

function tryDecrypt(encryptedToken, secret) {
  try {
    const encryptionKey = crypto
      .createHash('sha256')
      .update(secret)
      .digest()
    
    const [iv, encrypted] = encryptedToken.split(':')
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      encryptionKey,
      Buffer.from(iv, 'hex')
    )
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return { success: true, decrypted }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function run() {
  try {
    const mongoUri = 'mongodb+srv://mailmation:mailmation%40tarasaka@cluster0.nlmpwkg.mongodb.net/?appName=Cluster0'
    await mongoose.connect(mongoUri)
    const keyData = await ApiKey.findOne({ provider: 'gemini' })
    if (!keyData) {
      console.log('No Gemini key found')
      process.exit(0)
    }

    const secretsToTry = [
      'default-secret-change-in-production',
      'mailflow-dev-secret-change-this-in-production-12345'
    ]

    for (const secret of secretsToTry) {
      const res = tryDecrypt(keyData.api_key, secret)
      console.log(`Trying secret: "${secret}"`)
      if (res.success) {
        console.log(`  => Decrypted successfully! Length: ${res.decrypted.length}, Value: ${res.decrypted}`)
      } else {
        console.log(`  => Decrypt failed: ${res.error}`)
      }
    }

  } catch (err) {
    console.error(err)
  } finally {
    await mongoose.disconnect()
  }
}

run()
