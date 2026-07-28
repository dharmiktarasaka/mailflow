import { Account } from '../db/models.js'
import { encryptToken } from './crypto.js'

export async function updateAccountTokens(accountId, credentials) {
  const encryptedAccessToken = encryptToken(credentials.access_token)
  const tokenExpiry = credentials.expiry_date || Date.now() + 3600000

  const update = {
    access_token: encryptedAccessToken,
    token_expiry: tokenExpiry,
    updated_at: new Date()
  }

  if (credentials.refresh_token) {
    update.refresh_token = encryptToken(credentials.refresh_token)
  }

  await Account.findByIdAndUpdate(accountId, update)
  
  console.log('✓ Updated tokens for account', accountId)
}