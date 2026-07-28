import mongoose from 'mongoose'
import dotenv from 'dotenv'
import axios from 'axios'
import { ApiKey } from '../db/models.js'
import { decryptTokenSafely } from '../services/crypto.js'

dotenv.config({ path: '.env' })

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mailflow')
    console.log('MongoDB connected')

    const keyData = await ApiKey.findOne({ provider: 'gemini' })
    if (!keyData) {
      console.log('No Gemini API key found in DB')
      process.exit(1)
    }

    const decryptedKey = decryptTokenSafely(keyData.api_key)
    console.log('Decrypted Key length:', decryptedKey ? decryptedKey.length : 0)
    console.log('Decrypted Key (first 8 chars):', decryptedKey ? decryptedKey.substring(0, 8) : 'null')
    console.log('Using model:', keyData.model)

    try {
      const response = await axios.post('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        model: keyData.model || 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      }, {
        headers: {
          'Authorization': `Bearer ${decryptedKey}`,
          'Content-Type': 'application/json',
        },
      })
      console.log('Success!', response.data)
    } catch (apiError) {
      console.error('API Error Response status:', apiError.response?.status)
      console.error('API Error Response data:', JSON.stringify(apiError.response?.data, null, 2))
      console.error('API Error Message:', apiError.message)
    }

  } catch (err) {
    console.error('Script error:', err)
  } finally {
    await mongoose.disconnect()
  }
}

run()
