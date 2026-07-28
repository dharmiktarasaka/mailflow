import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { ApiKey } from '../db/models.js'

dotenv.config({ path: '.env' })

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mailflow')
    console.log('MongoDB connected')

    const keyData = await ApiKey.findOne({ provider: 'gemini' })
    if (!keyData) {
      console.log('No Gemini API key found')
      process.exit(1)
    }

    console.log('Stored value length:', keyData.api_key.length)
    console.log('Contains colon:', keyData.api_key.includes(':'))
    if (keyData.api_key.includes(':')) {
      const parts = keyData.api_key.split(':')
      console.log('Parts count:', parts.length)
      console.log('IV length:', parts[0].length)
      console.log('Encrypted text length:', parts[1].length)
    } else {
      console.log('Raw value (first 8 chars):', keyData.api_key.substring(0, 8))
    }

  } catch (err) {
    console.error('Error:', err)
  } finally {
    await mongoose.disconnect()
  }
}

run()
