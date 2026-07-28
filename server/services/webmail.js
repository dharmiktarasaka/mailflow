import nodemailer from 'nodemailer'
import { Account } from '../db/models.js'
import { buildEmailHtml } from './emailTemplate.js'

/**
 * Get active account from DB or auto-fallback to Hostinger Webmail from .env
 */
export async function getActiveAccount() {
  try {
    let account = await Account.findOne({ is_active: true })
    if (account) return account

    // Check if WEBMAIL_USER is set in environment
    if (process.env.WEBMAIL_USER) {
      account = await Account.findOneAndUpdate(
        { email: process.env.WEBMAIL_USER },
        {
          provider: 'hostinger',
          email: process.env.WEBMAIL_USER,
          display_name: process.env.WEBMAIL_FROM_NAME || process.env.WEBMAIL_USER.split('@')[0],
          is_active: true
        },
        { upsert: true, new: true }
      )
      return account
    }

    // Fallback search any account if present
    const anyAccount = await Account.findOne({})
    if (anyAccount) return anyAccount

    // Default object fallback if WEBMAIL credentials exist
    return {
      provider: 'hostinger',
      email: process.env.WEBMAIL_USER || 'webmail@hostinger.com',
      display_name: process.env.WEBMAIL_FROM_NAME || 'Hostinger Webmail',
      is_active: true
    }
  } catch (err) {
    console.error('Error getting active account:', err)
    return null
  }
}

/**
 * Ensure Hostinger Webmail Account exists in DB at startup if configured in .env
 */
export async function ensureHostingerAccount() {
  const email = process.env.WEBMAIL_USER
  if (!email) return null

  try {
    const displayName = process.env.WEBMAIL_FROM_NAME || email.split('@')[0]
    let account = await Account.findOne({ email })

    if (!account) {
      account = await Account.create({
        provider: 'hostinger',
        email,
        display_name: displayName,
        is_active: true
      })
      console.log(`✓ Auto-configured Hostinger Webmail account for ${email}`)
    } else if (!account.is_active) {
      // Ensure at least one active account
      const activeExists = await Account.findOne({ is_active: true, _id: { $ne: account._id } })
      if (!activeExists) {
        account.is_active = true
        await account.save()
        console.log(`✓ Activated Hostinger Webmail account for ${email}`)
      }
    }
    return account
  } catch (err) {
    console.error('Failed to ensure Hostinger account:', err.message)
    return null
  }
}

/**
 * Create SMTP transporter for Hostinger Webmail
 */
export function getWebmailTransporter(overrideConfig = {}) {
  const host = overrideConfig.host || process.env.WEBMAIL_HOST || process.env.SMTP_HOST || 'smtp.hostinger.com'
  const port = parseInt(overrideConfig.port || process.env.WEBMAIL_PORT || process.env.SMTP_PORT || '465')
  const user = overrideConfig.user || process.env.WEBMAIL_USER || process.env.SMTP_USER || process.env.EMAIL_USER || ''
  const pass = overrideConfig.pass || process.env.WEBMAIL_PASS || process.env.SMTP_PASS || process.env.EMAIL_PASS || ''
  const secure = overrideConfig.secure !== undefined
    ? overrideConfig.secure
    : (process.env.WEBMAIL_SECURE !== 'false' && (port === 465 || !process.env.WEBMAIL_PORT))

  if (!user || !pass) {
    console.warn('⚠️ Hostinger Webmail credentials (WEBMAIL_USER/EMAIL_USER and WEBMAIL_PASS/EMAIL_PASS) are missing in environment variables (.env)')
  } else if (pass === 'zigz-896q-im2g-t1iz') {
    console.warn('⚠️ WEBMAIL_PASS in .env is set to the default placeholder ("zigz-896q-im2g-t1iz"). Please set your real Hostinger email password in .env.')
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false
    }
  })
}

/**
 * Send an email via Hostinger Webmail SMTP
 */
export async function sendWebmailEmail(account, to, subject, body, trackingPixel = '', threadId = null, imageUrl = null, options = {}) {
  try {
    const user = process.env.WEBMAIL_USER || process.env.EMAIL_USER || account?.email || ''
    const pass = process.env.WEBMAIL_PASS || process.env.EMAIL_PASS || account?.password || ''
    const fromName = process.env.WEBMAIL_FROM_NAME || account?.display_name || 'MailFlow'
    const fromAddress = user ? `"${fromName}" <${user}>` : `"${fromName}"`

    console.log(`📧 Attempting to send email via SMTP using account: ${user}`)
    
    const htmlBody = buildEmailHtml(body, { imageUrl, trackingPixel })

    const mailOptions = {
      from: fromAddress,
      to,
      subject,
      text: body,
      html: htmlBody,
    }

    if (threadId || options.messageId) {
      const referenceId = options.messageId || threadId
      mailOptions.headers = {
        'In-Reply-To': referenceId,
        'References': referenceId,
      }
    }

    const transporter = getWebmailTransporter({ user, pass })
    const info = await transporter.sendMail(mailOptions)

    console.log('✓ Hostinger Webmail sent email successfully to:', to, '| Message-ID:', info.messageId)

    return {
      success: true,
      messageId: info.messageId,
      threadId: threadId || info.messageId,
    }
  } catch (error) {
    console.error('❌ Hostinger Webmail send error:', error)
    let errorMessage = error.message || 'Failed to send email via Hostinger Webmail'
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      errorMessage = `Hostinger Webmail SMTP Authentication Failed (535). Please verify WEBMAIL_USER (${process.env.WEBMAIL_USER || 'not set'}) and WEBMAIL_PASS in your .env file.`
    }
    return {
      success: false,
      error: errorMessage,
    }
  }
}
