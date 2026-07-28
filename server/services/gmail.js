import { google } from 'googleapis'
import { decryptToken, decryptTokenSafely } from './crypto.js'
import { Config, Lead } from '../db/models.js'
import { buildEmailHtml } from './emailTemplate.js'

async function getOAuth2Client() {
  let clientId = process.env.GMAIL_CLIENT_ID
  let clientSecret = process.env.GMAIL_CLIENT_SECRET
  const redirectUri = process.env.GMAIL_REDIRECT_URI
  
  // Try to load from database if not set
  if (!clientId || !clientSecret) {
    const config = await Config.findOne({ key: 'credentials' })
    if (config) {
      try {
        const creds = JSON.parse(config.value)
        clientId = clientId || creds.gmail_client_id
        clientSecret = clientSecret || decryptTokenSafely(creds.gmail_client_secret)
      } catch (e) {}
    }
  }

  if (!clientId || !clientSecret) {
    throw new Error('Gmail OAuth credentials not configured. Please add your credentials in Settings.')
  }
  
  if (!redirectUri) {
    throw new Error('Gmail redirect URI not configured. Set GMAIL_REDIRECT_URI')
  }
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export async function getGmailAuthUrl() {
  const oauth2Client = await getOAuth2Client()
  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ]

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  })

  return url
}

export async function exchangeCodeForToken(code) {
  const oauth2Client = await getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

export async function sendGmailEmail(account, to, subject, body, trackingPixel = '', threadId = null, imageUrl = null, options = {}) {
  try {
    const auth = await getOAuth2Client()

    const encryptedAccessToken = account.access_token
    const encryptedRefreshToken = account.refresh_token

    // Decrypt tokens
    const accessToken = decryptToken(encryptedAccessToken)
    const refreshToken = decryptToken(encryptedRefreshToken)

    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: account.token_expiry,
    })

    // Check if token needs refresh
    if (account.token_expiry && account.token_expiry < Date.now()) {
      const { credentials } = await auth.refreshAccessToken()
      auth.setCredentials(credentials)
      
      // Update tokens in database
      const { updateAccountTokens } = await import('./updateTokens.js')
      await updateAccountTokens(account._id || account.id, credentials)
    }

    const gmail = google.gmail({ version: 'v1', auth })

    // Build email as proper HTML email with template
    const emailHtml = buildEmailHtml(body, { imageUrl, trackingPixel })

    // Build email headers
    const headers = [
      'MIME-Version: 1.0',
      `From: ${account.email}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
    ]

    // If threadId provided, reply to the thread
    if (threadId) {
      const messageIdRef = options.messageId || threadId;
      const formattedId = messageIdRef.startsWith('<') ? messageIdRef : `<${messageIdRef}>`;
      headers.push(`In-Reply-To: ${formattedId}`)
      headers.push(`References: ${formattedId}`)
    }

    const message = [
      ...headers,
      '',
      emailHtml,
    ].join('\r\n')

    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')

    const requestBody = {
      raw: encodedMessage,
    }

    // If threadId provided, send as reply to the thread
    if (threadId) {
      requestBody.threadId = threadId
    }

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody,
    })

    // Save threading information to lead if this is the initial email (not a reply) and we have lead info
    if (options.leadId && !options.isReply) {
      try {
        await Lead.findByIdAndUpdate(options.leadId, {
          messageId: result.data.id,
          threadId: result.data.threadId,
          originalSubject: subject
        })
        console.log(`✓ Saved threading info for lead ${options.leadId}: messageId=${result.data.id}, threadId=${result.data.threadId}`)
      } catch (saveError) {
        console.warn('Warning: Could not save threading info to lead:', saveError.message)
      }
    }

    return {
      success: true,
      messageId: result.data.id,
      threadId: result.data.threadId,
    }
  } catch (error) {
    console.error('Gmail send error:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

export async function getGmailReplies(account, since = null) {
  try {
    const auth = await getOAuth2Client()

    const accessToken = decryptToken(account.access_token)
    const refreshToken = decryptToken(account.refresh_token)

    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: account.token_expiry,
    })

    // Refresh token if expired
    if (account.token_expiry && account.token_expiry < Date.now()) {
      const { credentials } = await auth.refreshAccessToken()
      auth.setCredentials(credentials)
      const { updateAccountTokens } = await import('./updateTokens.js')
      await updateAccountTokens(account._id || account.id, credentials)
    }

    const gmail = google.gmail({ version: 'v1', auth })

     // Get recent messages - check all messages from last 24 hours to catch both read and unread replies
     // Also look in important and sent folders to catch replies that might be threaded
     const query = since ? `after:${Math.floor(since / 1000)}` : 'in:inbox newer_than:1d'
    
    const result = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
    })

    if (!result.data.messages) {
      return []
    }

    const messages = await Promise.all(
      result.data.messages.map(async (msg) => {
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        })

        const headers = fullMessage.data.payload.headers
        const inReplyTo = headers.find(h => h.name === 'In-Reply-To')?.value
        const messageId = headers.find(h => h.name === 'Message-ID')?.value
        const from = headers.find(h => h.name === 'From')?.value
        const subject = headers.find(h => h.name === 'Subject')?.value
        const date = headers.find(h => h.name === 'Date')?.value

        let body = ''
        if (fullMessage.data.payload.parts) {
          const textPart = fullMessage.data.payload.parts.find(p => p.mimeType === 'text/plain')
          if (textPart && textPart.body.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
          }
        } else if (fullMessage.data.payload.body.data) {
          body = Buffer.from(fullMessage.data.payload.body.data, 'base64').toString('utf-8')
        }

        return {
          messageId: msg.id,
          threadId: fullMessage.data.threadId,
          inReplyTo,
          from,
          subject,
          body: body.substring(0, 500), // First 500 chars
          date: new Date(date),
        }
      })
    )

    return messages
  } catch (error) {
    console.error('Gmail fetch replies error:', error)
    return []
  }
}

export default {
  getGmailAuthUrl,
  exchangeCodeForToken,
  sendGmailEmail,
  getGmailReplies,
}
