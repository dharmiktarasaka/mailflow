import express from 'express'
import axios from 'axios'
import { ApiKey, Config } from '../db/models.js'
import { encryptToken, decryptTokenSafely } from '../services/crypto.js'

const router = express.Router()

function maskSecret(secret) {
  if (!secret || secret.length < 8) return secret
  return secret.substring(0, 4) + '*'.repeat(secret.length - 8) + secret.substring(secret.length - 4)
}

const PROVIDER_CONFIG = {
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-3-7-sonnet-20250219',
    models: ['claude-3-7-opus-20250219', 'claude-3-7-sonnet-20250219', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    apiUrl: 'https://api.anthropic.com/v1/messages',
    supportsVision: true,
  },
  abhibot: {
    name: 'abhibot',
    defaultModel: 'claude-sonnet-4-6',
    models: ['claude-sonnet-4-6'],
    apiUrl: 'https://opus.abhibots.com/v1/chat/completions',
    supportsVision: true,
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    supportsVision: true,
  },
  grok: {
    name: 'xAI (Grok)',
    defaultModel: 'grok-2',
    models: ['grok-2', 'grok-2-vision-1212', 'grok-beta'],
    apiUrl: 'https://api.x.ai/v1/chat/completions',
    supportsVision: true,
  },
  deepseek: {
    name: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-coder'],
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    supportsVision: false,
  },
  groq: {
    name: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
    supportsVision: false,
  },
  together: {
    name: 'Together AI',
    defaultModel: 'qwen3.5-122b-a10b',
    models: ['qwen3.5-122b-a10b', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x22B-Instruct-v0.1'],
    apiUrl: 'https://api.together.xyz/v1/chat/completions',
    supportsVision: false,
  },
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    supportsVision: true,
  },
  mistral: {
    name: 'Mistral AI',
    defaultModel: 'mistral-small-latest',
    models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'open-mistral-nemo'],
    apiUrl: 'https://api.mistral.ai/v1/chat/completions',
    supportsVision: false,
  },
}

// Get all API keys
router.get('/api-keys', async (req, res) => {
  try {
    const keys = await ApiKey.find().sort('provider')
    const result = keys.map(k => ({
      id: k._id,
      provider: k.provider,
      providerName: PROVIDER_CONFIG[k.provider]?.name || k.provider,
      model: k.model,
      isActive: k.is_active,
      apiUrl: k.api_url,
      hasKey: !!k.api_key,
      createdAt: k.created_at,
    }))
    res.json(result)
  } catch (error) {
    console.error('Error fetching API keys:', error)
    res.status(500).json({ error: error.message })
  }
})

// Save API key
router.post('/api-keys', async (req, res) => {
  try {
    const { provider, apiUrl, model } = req.body
    const apiKey = (req.body.apiKey || '').trim()

    console.log('Saving API key for provider:', provider)

    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'Provider and API key are required' })
    }

    if (!PROVIDER_CONFIG[provider]) {
      return res.status(400).json({ error: `Unknown provider: ${provider}. Available: ${Object.keys(PROVIDER_CONFIG).join(', ')}` })
    }

    const providerCfg = PROVIDER_CONFIG[provider]
    const finalModel = model || providerCfg.defaultModel
    const finalUrl = apiUrl || providerCfg.apiUrl

    let finalKey
    if (apiKey.startsWith('••••')) {
      const existing = await ApiKey.findOne({ provider })
      if (!existing || !existing.api_key) {
        return res.status(400).json({ error: 'No existing key to preserve' })
      }
      finalKey = existing.api_key
    } else {
      finalKey = encryptToken(apiKey)
    }

    // Use findOneAndUpdate for upsert
    await ApiKey.findOneAndUpdate(
      { provider },
      {
        api_key: finalKey,
        api_url: finalUrl,
        model: finalModel,
        updated_at: new Date()
      },
      { upsert: true, new: true }
    )

    res.json({ success: true, provider, model: finalModel })
  } catch (error) {
    console.error('Error saving API key:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete API key
router.delete('/api-keys/:id', async (req, res) => {
  try {
    const { id } = req.params
    await ApiKey.findByIdAndDelete(id)
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting API key:', error)
    res.status(500).json({ error: error.message })
  }
})

// Set active API key
router.post('/api-keys/:id/activate', async (req, res) => {
  try {
    const { id } = req.params

    // First deactivate all
    await ApiKey.updateMany({}, { is_active: false })

    // Then activate the selected one
    await ApiKey.findByIdAndUpdate(id, { is_active: true })

    res.json({ success: true })
  } catch (error) {
    console.error('Error activating API key:', error)
    res.status(500).json({ error: error.message })
  }
})

// Test API key
router.post('/api-keys/:id/test', async (req, res) => {
  try {
    const { id } = req.params

    const keyData = await ApiKey.findById(id)
    if (!keyData) {
      return res.status(404).json({ error: 'API key not found' })
    }

    const provider = PROVIDER_CONFIG[keyData.provider]
    if (!provider) {
      return res.status(400).json({ error: 'Unknown provider' })
    }

    const decryptedKey = decryptTokenSafely(keyData.api_key)

    let response
    try {
      if (keyData.provider === 'anthropic') {
        response = await axios.post(provider.apiUrl, {
          model: keyData.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }, {
          headers: {
            'x-api-key': decryptedKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        })
      } else {
        response = await axios.post(provider.apiUrl, {
          model: keyData.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }, {
          headers: {
            'Authorization': `Bearer ${decryptedKey}`,
            'Content-Type': 'application/json',
          },
        })
      }
      res.json({ valid: true, provider: keyData.provider, model: keyData.model })
    } catch (apiError) {
      console.error('API test failed:', apiError.response?.data || apiError.message)
      res.json({ valid: false, error: apiError.response?.data?.error?.message || apiError.message })
    }
  } catch (error) {
    console.error('Error testing API key:', error)
    res.json({ valid: false, error: error.message })
  }
})

// Get active AI client (for internal use)
export async function getActiveAI() {
  let keyData = await ApiKey.findOne({ is_active: true })
  if (!keyData) {
    // Fallback to first available
    keyData = await ApiKey.findOne()
    if (!keyData) {
      throw new Error('No AI API key configured. Please add an API key in Settings.')
    }
    console.log('Using fallback API key:', keyData.provider, 'Key present:', !!keyData.api_key)
  } else {
    console.log('Using active API key:', keyData.provider, 'Key present:', !!keyData.api_key)
  }
  const activeAI = keyData.toObject()
  activeAI.api_key = decryptTokenSafely(activeAI.api_key)
  return activeAI
}

export { PROVIDER_CONFIG }

// Get OAuth credentials (Gmail/Outlook client IDs)
router.get('/oauth-credentials', async (req, res) => {
  try {
    const config = await Config.findOne({ key: 'credentials' })
    if (config && config.value) {
      const creds = JSON.parse(config.value)
      const rawGmailSecret = decryptTokenSafely(creds.gmail_client_secret)
      const rawOutlookSecret = decryptTokenSafely(creds.outlook_client_secret)
      res.json({
        gmail_client_id: creds.gmail_client_id || '',
        gmail_client_secret: rawGmailSecret ? maskSecret(rawGmailSecret) : '',
        outlook_client_id: creds.outlook_client_id || '',
        outlook_client_secret: rawOutlookSecret ? maskSecret(rawOutlookSecret) : '',
      })
    } else {
      res.json({
        gmail_client_id: '',
        gmail_client_secret: '',
        outlook_client_id: '',
        outlook_client_secret: '',
      })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Save OAuth credentials
router.post('/oauth-credentials', async (req, res) => {
  try {
    const { gmail_client_id, gmail_client_secret, outlook_client_id, outlook_client_secret } = req.body

    // Load existing to preserve unmodified secrets if masked strings are sent
    let existingCreds = {}
    const config = await Config.findOne({ key: 'credentials' })
    if (config && config.value) {
      try {
        existingCreds = JSON.parse(config.value)
      } catch (e) {
        console.error('Failed to parse existing credentials:', e)
      }
    }

    let finalGmailSecret = gmail_client_secret
    if (gmail_client_secret && (gmail_client_secret.includes('*') || gmail_client_secret.startsWith('••'))) {
      finalGmailSecret = existingCreds.gmail_client_secret
    } else if (gmail_client_secret) {
      finalGmailSecret = encryptToken(gmail_client_secret)
    }

    let finalOutlookSecret = outlook_client_secret
    if (outlook_client_secret && (outlook_client_secret.includes('*') || outlook_client_secret.startsWith('••'))) {
      finalOutlookSecret = existingCreds.outlook_client_secret
    } else if (outlook_client_secret) {
      finalOutlookSecret = encryptToken(outlook_client_secret)
    }

    const creds = JSON.stringify({
      gmail_client_id,
      gmail_client_secret: finalGmailSecret,
      outlook_client_id,
      outlook_client_secret: finalOutlookSecret,
    })

    await Config.findOneAndUpdate(
      { key: 'credentials' },
      { value: creds, updated_at: new Date() },
      { upsert: true }
    )

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get backup interval
router.get('/backup-interval', async (req, res) => {
  try {
    const config = await Config.findOne({ key: 'backup_interval_minutes' })
    const intervalMinutes = config ? parseInt(config.value) : 60
    res.json({ intervalMinutes })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Set backup interval
router.post('/backup-interval', async (req, res) => {
  try {
    const { intervalMinutes } = req.body

    if (!intervalMinutes || intervalMinutes < 5 || intervalMinutes > 1440) {
      return res.status(400).json({ error: 'Backup interval must be between 5 and 1440 minutes (daily)' })
    }

    await Config.findOneAndUpdate(
      { key: 'backup_interval_minutes' },
      { value: intervalMinutes.toString(), updated_at: new Date() },
      { upsert: true }
    )

    // Note: setBackupInterval from db.js is no longer used/needed for MongoDB
    // but if it was doing something else, we might need to handle it.

    res.json({ success: true, intervalMinutes })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router