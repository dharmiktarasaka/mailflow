import express from 'express'
import { Account } from '../db/models.js'
import { getGmailAuthUrl, exchangeCodeForToken as gmailExchangeCode } from '../services/gmail.js'
import { getOutlookAuthUrl, exchangeCodeForToken as outlookExchangeCode } from '../services/outlook.js'
import { encryptToken } from '../services/crypto.js'
import { ensureHostingerAccount, getActiveAccount } from '../services/webmail.js'
import axios from 'axios'

const router = express.Router()
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// Gmail OAuth start
router.get('/gmail', async (req, res) => {
  try {
    const url = await getGmailAuthUrl()
    console.log('Gmail auth URL generated:', url.substring(0, 50) + '...')
    res.json({ url })
  } catch (error) {
    console.error('Gmail auth error:', error.message)
    res.status(400).json({ error: error.message })
  }
})

// Gmail OAuth callback
router.get('/gmail/callback', async (req, res) => {
  const { code, error } = req.query

  console.log('Gmail callback hit. Code:', code?.substring(0, 20), 'Error:', error)

  if (error) {
    console.log('Gmail auth error from Google:', error)
    return res.redirect(`${FRONTEND_URL}/?error=${error}`)
  }

  try {
    if (!code) {
      throw new Error('No authorization code received from Google')
    }

    const tokens = await gmailExchangeCode(code)
    console.log('Got tokens from Google')

    // Get user info
    const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    const email = userRes.data.email
    const displayName = userRes.data.name
    const avatarUrl = userRes.data.picture

    console.log('Gmail user info:', email)

    const encryptedAccessToken = encryptToken(tokens.access_token)
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
    const tokenExpiry = tokens.expiry_date || Date.now() + 3600000

    await Account.findOneAndUpdate(
      { email },
      {
        provider: 'gmail',
        display_name: displayName,
        avatar_url: avatarUrl,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expiry: tokenExpiry,
        is_active: true
      },
      { upsert: true }
    )

    console.log('Account saved, redirecting to setup')
    res.redirect(`${FRONTEND_URL}/?connected=gmail`)
  } catch (error) {
    console.error('Gmail callback error:', error)
    res.redirect(`${FRONTEND_URL}/?error=gmail_auth_failed&details=${encodeURIComponent(error.message)}`)
  }
})

// Outlook OAuth start
router.get('/outlook', async (req, res) => {
  try {
    console.log('Outlook auth request received')
    const url = await getOutlookAuthUrl()
    console.log('Outlook auth URL generated:', url.substring(0, 50) + '...')
    res.json({ url })
  } catch (error) {
    console.error('Outlook auth error:', error.message)
    res.status(400).json({ error: error.message })
  }
})

// Outlook OAuth callback
router.get('/outlook/callback', async (req, res) => {
  const { code, error } = req.query

  console.log('=== OUTLOOK CALLBACK DEBUG ===')
  console.log('Query params:', req.query)
  console.log('Code:', code?.substring(0, 20), 'Error:', error)

  if (error) {
    console.log('Outlook auth error from Microsoft:', error)
    return res.redirect(`${FRONTEND_URL}/?error=${error}`)
  }

  try {
    if (!code) {
      console.log('No authorization code received from Microsoft')
      throw new Error('No authorization code received from Microsoft')
    }

    console.log('Attempting to exchange code for tokens...')
    const tokens = await outlookExchangeCode(code)
    console.log('Got tokens from Microsoft:', tokens ? 'SUCCESS' : 'FAILED')

    // Get user info
    const userRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    const email = userRes.data.mail || userRes.data.userPrincipalName
    const displayName = userRes.data.displayName

    console.log('Outlook user info:', email)

    const encryptedAccessToken = encryptToken(tokens.access_token)
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
    const tokenExpiry = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : Date.now() + 3600000

    await Account.findOneAndUpdate(
      { email },
      {
        provider: 'outlook',
        display_name: displayName,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expiry: tokenExpiry,
        is_active: true
      },
      { upsert: true }
    )

    console.log('Account saved, redirecting to setup')
    res.redirect(`${FRONTEND_URL}/?connected=outlook`)
  } catch (error) {
    console.error('Outlook callback error:', error)
    res.redirect(`${FRONTEND_URL}/?error=outlook_auth_failed&details=${encodeURIComponent(error.message)}`)
  }
})

// Get connected accounts
router.get('/accounts', async (req, res) => {
  try {
    await ensureHostingerAccount()
    const accounts = await Account.find({}, '-access_token -refresh_token')
    res.json(accounts)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Set active account
router.post('/accounts/:id/activate', async (req, res) => {
  try {
    const { id } = req.params

    // Deactivate all
    await Account.updateMany({}, { is_active: false })

    // Activate selected
    await Account.findByIdAndUpdate(id, { is_active: true })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Disconnect account
router.delete('/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params
    await Account.findByIdAndDelete(id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get user (current)
router.get('/user', async (req, res) => {
  try {
    const account = await getActiveAccount()
    res.json(account || { loggedIn: false })
  } catch (error) {
    console.error('Error fetching user account:', error)
    res.json({ loggedIn: false, error: error.message })
  }
})

export default router

