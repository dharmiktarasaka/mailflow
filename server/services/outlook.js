import axios from 'axios'
import { decryptToken, decryptTokenSafely } from './crypto.js'
import { Config, Lead } from '../db/models.js'
import { buildEmailHtml } from './emailTemplate.js'

// Use 'common' for multi-tenant application
const OAUTH_TENANT = 'common'
const GRAPH_API = 'https://graph.microsoft.com/v1.0'

async function getOutlookCredentials() {
  let clientId = process.env.OUTLOOK_CLIENT_ID
  let clientSecret = process.env.OUTLOOK_CLIENT_SECRET
  let redirectUri = process.env.OUTLOOK_REDIRECT_URI
  
  console.log('Initial Outlook creds from env:', { 
    clientId: clientId ? `${clientId.substring(0, 10)}...` : '[NOT SET]', 
    clientSecret: clientSecret ? `${clientSecret.substring(0, 10)}...` : '[NOT SET]', 
    redirectUri: redirectUri || '[NOT SET]'
  })
  
  // Try to load from database if not set
  if (!clientId || !clientSecret) {
    console.log('Loading Outlook credentials from database...')
    const config = await Config.findOne({ key: 'credentials' })
    if (config) {
      try {
        const creds = JSON.parse(config.value)
        clientId = clientId || creds.outlook_client_id
        clientSecret = clientSecret || decryptTokenSafely(creds.outlook_client_secret)
        console.log('Loaded from database:', {
          clientId: clientId ? `${clientId.substring(0, 10)}...` : '[NOT SET]',
          clientSecret: clientSecret ? `${clientSecret.substring(0, 10)}...` : '[NOT SET]'
        })
      } catch (e) {
        console.error('Failed to parse database credentials:', e)
      }
    } else {
      console.log('No credentials found in database')
    }
  }
  
  // Set default redirect URI if not in environment
  if (!redirectUri) {
    redirectUri = 'http://localhost:3001/auth/outlook/callback'
    console.log('Using default redirect URI:', redirectUri)
  }
  
  if (!clientId || !clientSecret) {
    throw new Error('Outlook OAuth credentials not configured. Please add your credentials in Settings.')
  }
  
  console.log('Final Outlook credentials:', {
    clientId: `${clientId.substring(0, 10)}...`,
    clientSecret: `${clientSecret.substring(0, 10)}...`,
    redirectUri
  })
  
  return { clientId, clientSecret, redirectUri }
}

export async function getOutlookAuthUrl() {
  const { clientId, redirectUri } = await getOutlookCredentials()
  const scopes = ['https://graph.microsoft.com/Mail.Send', 'https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.ReadWrite']
  const scopeString = scopes.join(' ')

  const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
  url.searchParams.append('client_id', clientId)
  url.searchParams.append('redirect_uri', redirectUri)
  url.searchParams.append('response_type', 'code')
  url.searchParams.append('scope', scopeString)
  url.searchParams.append('prompt', 'select_account')

  return url.toString()
}

export async function exchangeCodeForToken(code) {
  try {
    console.log('Starting Outlook token exchange...')
    const { clientId, clientSecret, redirectUri } = await getOutlookCredentials()
    
    console.log('Token exchange params:', {
      clientId: clientId?.substring(0, 10) + '...',
      redirectUri,
      grant_type: 'authorization_code',
      tenant: OAUTH_TENANT
    })
    
    const tokenUrl = `https://login.microsoftonline.com/${OAUTH_TENANT}/oauth2/v2.0/token`
    console.log('Token exchange URL:', tokenUrl)
    
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    )

    console.log('Token exchange successful')
    return response.data
  } catch (error) {
    console.error('Outlook token exchange error:', error.response?.data || error.message)
    console.error('Full error details:', error)
    throw error
  }
}

export async function refreshOutlookToken(refreshToken) {
  try {
    const { clientId, clientSecret } = await getOutlookCredentials()
    
    const response = await axios.post(
      `https://login.microsoftonline.com/${OAUTH_TENANT}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    )

    return response.data
  } catch (error) {
    console.error('Outlook token refresh error:', error)
    throw error
  }
}

export async function sendOutlookEmail(account, to, subject, body, trackingPixel = '', threadId = null, imageUrl = null, options = {}) {
  try {
    const encryptedAccessToken = account.access_token
    const encryptedRefreshToken = account.refresh_token
    
    if (!encryptedAccessToken) {
      throw new Error('Access token missing. Please reconnect your Outlook account.')
    }
    
    let accessToken = decryptToken(encryptedAccessToken)
    let refreshToken = decryptToken(encryptedRefreshToken)
    
    console.log('Decrypted tokens for Outlook send:', { 
      hasAccessToken: !!accessToken, 
      hasRefreshToken: !!refreshToken,
      tokenExpiry: account.token_expiry,
      now: Date.now()
    })
    
    // Check if token needs refresh
    if (account.token_expiry && account.token_expiry < Date.now()) {
      console.log('Outlook token expired, refreshing...')
      const newTokens = await refreshOutlookToken(refreshToken)
      accessToken = newTokens.access_token
      refreshToken = newTokens.refresh_token
      
      console.log('Outlook tokens refreshed successfully')
      
      // Update tokens in database
      const { updateAccountTokens } = await import('./updateTokens.js')
      await updateAccountTokens(account._id || account.id, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: Date.now() + (newTokens.expires_in * 1000),
      })
    }
    
    // Build email as proper HTML email with template
    const emailHtml = buildEmailHtml(body, { imageUrl, trackingPixel })
    
    let message
    
    // If this is a reply (we have threadId and isReply flag)
    if (threadId && options.isReply) {
      const messageIdRef = options.messageId || threadId;
      const formattedId = messageIdRef.startsWith('<') ? messageIdRef : `<${messageIdRef}>`;
      
      message = {
        subject: subject || 'No Subject',
        body: {
          contentType: 'html',
          content: emailHtml,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
        internetMessageHeaders: [
          { name: 'In-Reply-To', value: formattedId },
          { name: 'References', value: formattedId }
        ]
      }
    } else {
      message = {
        subject: subject || 'No Subject',
        body: {
          contentType: 'html',
          content: emailHtml,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
      }
    }
    
    let response
    
    // If threadId provided and we're not doing a header-based reply, we try to use the reply API for better threading
    if (threadId && !threadId.startsWith('outlook-') && options.isReply) {
      try {
        console.log(`Attempting to reply to Outlook conversation: ${threadId}`)
        // 1. Find the latest message in this conversation to reply to
        const messagesRes = await axios.get(
          `${GRAPH_API}/me/messages?$filter=conversationId eq '${threadId}'&$top=1`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        
        const lastMessage = messagesRes.data.value[0]
        if (lastMessage) {
          console.log(`Found message ${lastMessage.id} to reply to`)
          // 2. Create a reply draft
          const replyRes = await axios.post(
            `${GRAPH_API}/me/messages/${lastMessage.id}/createReply`,
            {},
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          
          const replyId = replyRes.data.id
          
          // 3. Update the reply draft with our content
          await axios.patch(
            `${GRAPH_API}/me/messages/${replyId}`,
            {
              body: {
                contentType: 'HTML',
                content: emailHtml
              }
            },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          
          // 4. Send the reply
          await axios.post(
            `${GRAPH_API}/me/messages/${replyId}/send`,
            {},
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          
          return {
            success: true,
            messageId: replyId,
            threadId: threadId
          }
        }
      } catch (replyErr) {
        console.error('Failed to use Outlook reply API, falling back to sendMail:', replyErr.response?.data || replyErr.message)
        // Fallback to normal send if reply API fails
      }
    }
    
    // Default: Send as a new message
    response = await axios.post(
      `${GRAPH_API}/me/sendMail`,
      {
        message,
        saveToSentItems: true,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )
    
    let messageId = 'outlook-' + Date.now() // Placeholder
    
    // Try to get actual message ID from sent items (simplified approach)
    // In a real implementation, you might want to search sent items for the message we just sent
    // For now, we'll save threading information if this is an initial email
    
    // Save threading information to lead if this is the initial email (not a reply) and we have lead info
    if (options.leadId && !options.isReply && !(threadId && options.leadId && !options.isReply)) {
      try {
        await Lead.findByIdAndUpdate(options.leadId, {
          messageId: messageId,
          threadId: messageId,
          originalSubject: subject
        })
        console.log(`✓ Saved threading info for lead ${options.leadId}: messageId=${messageId}`)
      } catch (saveError) {
        console.warn('Warning: Could not save threading info to lead:', saveError.message)
      }
    }
    
    return {
      success: true,
      messageId: messageId,
    }
  } catch (error) {
    const msError = error.response?.data?.error?.message || error.response?.data?.error || error.message
    console.error('Outlook send error details:', error.response?.data || error.message)
    return {
      success: false,
      error: `Microsoft Error: ${msError}`,
    }
  }
}

export async function getOutlookReplies(account) {
   try {
     let accessToken = decryptToken(account.access_token)
     let refreshToken = decryptToken(account.refresh_token)

     // Refresh token if expired
     if (account.token_expiry && account.token_expiry < Date.now() && refreshToken) {
       const newTokens = await refreshOutlookToken(refreshToken)
       accessToken = newTokens.access_token
       refreshToken = newTokens.refresh_token
       const { updateAccountTokens } = await import('./updateTokens.js')
       await updateAccountTokens(account._id || account.id, {
         access_token: accessToken,
         refresh_token: refreshToken,
         expiry_date: Date.now() + (newTokens.expires_in * 1000),
       })
     }

     // Calculate date 24 hours ago in ISO format for Graph API
     const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
     const twentyFourHoursAgoISO = twentyFourHoursAgo.toISOString();

     // Get recent messages from last 24 hours to catch both read and unread replies
     const response = await axios.get(
       `${GRAPH_API}/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${twentyFourHoursAgoISO}&$orderby=receivedDateTime desc&$top=100`,
       {
         headers: {
           Authorization: `Bearer ${accessToken}`,
         },
       }
     );

     return response.data.value.map(msg => ({
       messageId: msg.id,
       from: msg.from.emailAddress.address,
       subject: msg.subject,
       body: msg.bodyPreview,
       date: new Date(msg.receivedDateTime),
       threadId: msg.conversationId,
       inReplyTo: msg.conversationId,
     }))
   } catch (error) {
     console.error('Outlook fetch replies error:', error)
     return []
   }
 }

export default {
  getOutlookAuthUrl,
  exchangeCodeForToken,
  refreshOutlookToken,
  sendOutlookEmail,
  getOutlookReplies,
}
