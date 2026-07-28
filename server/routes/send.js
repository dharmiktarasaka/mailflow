import express from 'express'
import { Account, Campaign, Draft, Lead, LeadEvent as Event, Followup } from '../db/models.js'
import { sendGmailEmail } from '../services/gmail.js'
import { sendOutlookEmail } from '../services/outlook.js'
import { sendWebmailEmail, getActiveAccount } from '../services/webmail.js'
import { replaceLeadPlaceholders } from '../services/leadUtils.js'
import { getNextBusinessDate } from '../services/dateUtils.js'
import { generateFollowupEmail, summarizeLinkedIn } from '../services/ai.js'

const router = express.Router()

// Store active send sessions
const activeSessions = {}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function isWeekend() {
  const day = new Date().getDay()
  return day === 0 || day === 6 // 0 is Sunday, 6 is Saturday
}

function isBusinessHours() {
  const hour = new Date().getHours()
  return hour >= 9 && hour < 18
}

async function getSentCountToday(accountEmail) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return await Event.countDocuments({
    event_type: 'sent',
    created_at: { $gte: today }
  })
}

function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

// Auto-create follow-ups for a lead after sending initial email using campaign's 4 custom manual templates
async function createFollowupsForLead(lead, campaign, sendDate = new Date()) {
  if (!lead || !campaign) return

  const defaultTemplates = [
    { sequence: 1, delay_days: 3, enabled: true, subject: 'Re: [subject]', body: 'Hi [f_name],\n\nI wanted to quickly follow up on my previous message to see if you had a chance to review it.\n\nI\'d love to hear your thoughts on how we can help [company_name].\n\nBest regards' },
    { sequence: 2, delay_days: 6, enabled: true, subject: 'Quick check-in regarding [company_name]', body: 'Hi [f_name],\n\nChecking in to see if this is on your radar.\n\nWe\'ve helped similar companies streamline their outreach. Would you be open for a quick chat this week?\n\nBest regards' },
    { sequence: 3, delay_days: 9, enabled: true, subject: 'Idea for [company_name]', body: 'Hi [f_name],\n\nI know you\'re busy! I just wanted to share one quick idea that could really benefit [company_name].\n\nIf you\'re interested, let me know when might be a good time to connect.\n\nThanks' },
    { sequence: 4, delay_days: 14, enabled: true, subject: 'Should I close your file?', body: 'Hi [f_name],\n\nI haven\'t heard back, so I assume now might not be the right time for [company_name].\n\nIf things change in the future, feel free to reach out anytime. Wish you all the best!\n\nRegards' }
  ]

  const templates = (campaign.followup_templates && campaign.followup_templates.length > 0)
    ? campaign.followup_templates
    : defaultTemplates

  for (const tmpl of templates) {
    if (tmpl.enabled === false) continue

    const seq = tmpl.sequence || 1
    const delayDays = tmpl.delay_days !== undefined ? tmpl.delay_days : (seq === 1 ? 3 : seq === 2 ? 6 : seq === 3 ? 9 : 14)

    const scheduledDate = getNextBusinessDate(sendDate, delayDays)

    // Add random human-like jitter (+/- 20 to 60 minutes)
    const isPositive = Math.random() < 0.5
    const minutes = Math.floor(Math.random() * (60 - 20 + 1)) + 20
    const offsetMs = minutes * 60 * 1000
    if (isPositive) {
      scheduledDate.setTime(scheduledDate.getTime() + offsetMs)
    } else {
      scheduledDate.setTime(scheduledDate.getTime() - offsetMs)
    }

    const existing = await Followup.findOne({
      lead_id: lead._id,
      sequence: seq,
    })

    if (!existing) {
      const subject = replaceLeadPlaceholders(tmpl.subject || 'Re: [subject]', lead)
      const body = replaceLeadPlaceholders(tmpl.body || '', lead)

      const followup = new Followup({
        lead_id: lead._id,
        campaign_id: campaign._id,
        sequence: seq,
        subject,
        body,
        scheduled_date: scheduledDate,
        status: 'pending',
        auto_cancel_on_reply: true,
      })
      await followup.save()
    }
  }
}

// Start sending campaign
router.post('/:campaign_id/start', async (req, res) => {
  try {
    const { campaign_id } = req.params
    const sessionId = `${campaign_id}-${Date.now()}`

    // Get active account
    const account = await getActiveAccount()
    if (!account) {
      return res.status(400).json({ error: 'No active email account connected' })
    }

    // Get campaign and drafts
    const campaign = await Campaign.findById(campaign_id).lean()
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' })
    }

    const approvedDrafts = await Draft.find({
      campaign_id,
      status: 'approved',
      sent_at: null
    }).sort({ created_at: 1 }).lean()

    if (!approvedDrafts.length) {
      return res.status(400).json({ error: 'No approved drafts to send' })
    }

    // Create session
    activeSessions[sessionId] = {
      campaign_id,
      account_id: account._id,
      total: approvedDrafts.length,
      sent: 0,
      failed: 0,
      status: 'running',
      startTime: Date.now(),
    }

    // Start async send loop
    sendCampaignAsync(sessionId, campaign, account, approvedDrafts).catch(err => {
      console.error('Send loop error:', err)
      if (activeSessions[sessionId]) {
        activeSessions[sessionId].status = 'error'
        activeSessions[sessionId].error = err.message
      }
    })

    res.json({ sessionId, success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

async function sendCampaignAsync(sessionId, campaign, account, drafts) {
  const session = activeSessions[sessionId]
  const trackingEnabled = process.env.ENABLE_OPEN_TRACKING === 'true'

  for (const draftData of drafts) {
    if (session.status === 'paused') {
      await new Promise(resolve => {
        const interval = setInterval(() => {
          if (session.status !== 'paused') {
            clearInterval(interval)
            resolve()
          }
        }, 1000)
      })
    }

    if (session.status === 'stopped') {
      break
    }

    // Check daily limit
    const sentToday = await getSentCountToday(account.email)
    if (sentToday >= campaign.daily_limit) {
      session.status = 'limit_reached'
      break
    }

    // Get lead data
    const lead = await Lead.findById(draftData.lead_id).lean()
    if (!lead) continue

    // Generate tracking pixel if enabled
    let trackingPixel = ''
    if (trackingEnabled) {
      const baseUrl = process.env.TRACKING_BASE_URL || 'http://localhost:5000'
      trackingPixel = `${baseUrl}/t/${draftData._id}.png`
    }

    // Replace placeholders dynamically
    const finalSubject = replaceLeadPlaceholders(draftData.subject, lead)
    const finalBody = replaceLeadPlaceholders(draftData.body, lead)

    // Send email
    let sendResult
    if (account.provider === 'gmail') {
      sendResult = await sendGmailEmail(account, lead.email, finalSubject, finalBody, trackingPixel, null, lead.image_url, {
        leadId: lead._id,
        isReply: false
      })
    } else if (account.provider === 'outlook') {
      sendResult = await sendOutlookEmail(account, lead.email, finalSubject, finalBody, trackingPixel, null, lead.image_url, {
        leadId: lead._id,
        isReply: false
      })
    } else {
      sendResult = await sendWebmailEmail(account, lead.email, finalSubject, finalBody, trackingPixel, null, lead.image_url, {
        leadId: lead._id,
        isReply: false
      })
    }

    if (sendResult.success) {
      // Update draft
      await Draft.findByIdAndUpdate(draftData._id, {
        status: 'sent',
        sent_at: new Date(),
        message_id: sendResult.messageId,
        thread_id: sendResult.threadId || ''
      })

      // Update lead status
      await Lead.findByIdAndUpdate(lead._id, { status: 'sent' })

      // Log event
      const event = new Event({
        lead_id: lead._id,
        draft_id: draftData._id,
        event_type: 'sent'
      })
      await event.save()

       // Auto-create follow-ups for this lead
       try {
         await createFollowupsForLead(lead, campaign, new Date())
       } catch (err) {
         console.error('Error creating follow-ups:', err)
       }

      session.sent++
    } else {
      session.failed++
      session.lastError = sendResult.error || 'Failed to send email'
      // Log failed send
      const event = new Event({
        lead_id: lead._id,
        draft_id: draftData._id,
        event_type: 'send_failed',
        metadata: JSON.stringify({ error: sendResult.error })
      })
      await event.save()
    }

    // Random delay between sends
    const delay = randomDelay(campaign.delay_min, campaign.delay_max)
    await new Promise(resolve => setTimeout(resolve, delay * 1000))
  }

  session.status = 'completed'
  session.endTime = Date.now()
}

// Get send session status
router.get('/:campaign_id/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params
    const session = activeSessions[sessionId]

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    res.json(session)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Pause sending
router.post('/:campaign_id/pause/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params
    const session = activeSessions[sessionId]

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    session.status = 'paused'
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Resume sending
router.post('/:campaign_id/resume/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params
    const session = activeSessions[sessionId]

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (session.status === 'paused') {
      session.status = 'running'
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Stop sending
router.post('/:campaign_id/stop/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params
    const session = activeSessions[sessionId]

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    session.status = 'stopped'
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Bulk start
let sendProgress = { status: 'idle', sent: 0, failed: 0, total: 0, current: '', error: null }
let sendInterval = null

router.post('/bulk-start', async (req, res) => {
  console.log('Bulk start request received:', req.body)
  try {
    const { delay = 60 } = req.body
    
    let account = await getActiveAccount()
    if (!account) {
      account = await ensureHostingerAccount()
    }

    const approvedDrafts = await Draft.find({
      status: { $in: ['draft', 'approved'] },
      sent_at: null
    }).populate('lead_id').sort({ created_at: 1 })
    
    console.log(`Found ${approvedDrafts.length} drafts to send:`, approvedDrafts.map(d => d._id))

    if (!approvedDrafts.length) {
      return res.status(400).json({ error: 'No email drafts ready to send' })
    }

    sendProgress = {
      status: 'sending',
      sent: 0,
      failed: 0,
      total: approvedDrafts.length,
      current: '',
      error: null
    }

    res.json({ status: 'sending', sent: 0, total: approvedDrafts.length });
    
    // Start sending process
    (async () => {
      console.log(`[Bulk Send] Asynchronous sending process started for ${approvedDrafts.length} drafts`);
      try {
        for (let i = 0; i < approvedDrafts.length; i++) {
          if (sendProgress.status === 'stopped') {
            console.log('[Bulk Send] Process stopped by user')
            break
          }

          const draftData = approvedDrafts[i]
          const lead = draftData.lead_id
          
          if (!lead) {
            console.log(`[Bulk Send] Skipping draft ${i+1}: Lead not found`)
            continue
          }

          console.log(`[Bulk Send] [${i+1}/${approvedDrafts.length}] Processing ${lead.email}`)
          sendProgress.current = lead.email

          // 1. Check Daily Limit
          try {
            const sentToday = await getSentCountToday(account.email)
            const campaign = await Campaign.findById(lead.campaign_id).lean()
            const limit = campaign?.daily_limit || 50
            
            if (sentToday >= limit) {
              console.log(`[Bulk Send] Limit reached: ${sentToday}/${limit}`)
              sendProgress.error = `Daily limit of ${limit} reached.`
              break
            }
          } catch (limitErr) {
            console.error('[Bulk Send] Limit check error:', limitErr.message)
          }

           // 2. Send Email
           try {
             const finalSubject = replaceLeadPlaceholders(draftData.subject, lead)
             const finalBody = replaceLeadPlaceholders(draftData.body, lead)

             let result
             if (account.provider === 'gmail') {
               result = await sendGmailEmail(account, lead.email, finalSubject, finalBody, '', null, lead.image_url, {
                 leadId: lead._id,
                 isReply: false
               })
             } else if (account.provider === 'outlook') {
               result = await sendOutlookEmail(account, lead.email, finalSubject, finalBody, '', null, null, {
                 leadId: lead._id,
                 isReply: false
               })
             } else {
               result = await sendWebmailEmail(account, lead.email, finalSubject, finalBody, '', null, lead.image_url, {
                 leadId: lead._id,
                 isReply: false
               })
             }

            if (result?.success) {
              console.log(`[Bulk Send] Sent successfully to ${lead.email}`)
              
              // Update Draft
              await Draft.findByIdAndUpdate(draftData._id, {
                status: 'sent',
                sent_at: new Date(),
                message_id: result.messageId,
                thread_id: result.threadId || result.messageId
              })
              
              // Update Lead
              await Lead.findByIdAndUpdate(lead._id, { status: 'sent' })

               // Create Follow-ups
               const campaign = await Campaign.findById(lead.campaign_id).lean()
               if (campaign) {
                 await createFollowupsForLead(lead, campaign, new Date()).catch(e => console.error('Followup error:', e.message))
               }
              
              // Save Event
              await Event.create({
                lead_id: lead._id,
                draft_id: draftData._id,
                event_type: 'sent',
                metadata: JSON.stringify({ messageId: result.messageId })
              })
              
              sendProgress.sent++
            } else {
              console.error(`[Bulk Send] Service error for ${lead.email}:`, result?.error)
              sendProgress.failed++
              sendProgress.lastError = result?.error
            }
          } catch (sendErr) {
            console.error(`[Bulk Send] Send error for ${lead.email}:`, sendErr.message)
            sendProgress.failed++
            sendProgress.lastError = sendErr.message
          }

          // 3. Wait for delay
          if (i < approvedDrafts.length - 1 && sendProgress.status !== 'stopped') {
            const randomFactor = 0.8 + (Math.random() * 0.4)
            const actualDelay = delay * randomFactor
            console.log(`[Bulk Send] Waiting ${actualDelay.toFixed(2)}s...`)
            await new Promise(resolve => setTimeout(resolve, actualDelay * 1000))
          }
        }
        
        console.log(`[Bulk Send] Loop finished. Sent: ${sendProgress.sent}, Failed: ${sendProgress.failed}`)
        sendProgress.status = 'completed'
      } catch (fatalErr) {
        console.error('[Bulk Send] FATAL LOOP ERROR:', fatalErr)
        sendProgress.status = 'error'
        sendProgress.error = fatalErr.message
      }
    })()

  } catch (error) {
    sendProgress.status = 'error'
    sendProgress.error = error.message
    if (!res.headersSent) {
      res.status(500).json({ error: error.message })
    }
  }
})

// Get send progress
router.get('/progress', (req, res) => {
  try {
    // Return a copy to avoid concurrent modification issues
    const snapshot = JSON.parse(JSON.stringify(sendProgress))
    res.json(snapshot)
  } catch (err) {
    console.error('Progress serialization error:', err)
    // Fallback if JSON.stringify fails (e.g. circular ref)
    res.json({ 
      status: sendProgress?.status || 'error',
      sent: sendProgress?.sent || 0,
      total: sendProgress?.total || 0,
      error: 'Data sync error'
    })
  }
})

// Stop sending
router.post('/stop', (req, res) => {
  sendProgress.status = 'stopped'
  if (sendInterval) {
    clearInterval(sendInterval)
    sendInterval = null
  }
  res.json({ success: true })
})

// Send single draft
router.post('/single', async (req, res) => {
  try {
    const { draft_id } = req.body
    
    if (!draft_id) {
      return res.status(400).json({ error: 'draft_id is required' })
    }

    let account = await getActiveAccount()
    if (!account) {
      account = await ensureHostingerAccount()
    }

    const draft = await Draft.findById(draft_id).populate('lead_id').lean()
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    if (draft.status === 'sent') {
      return res.status(400).json({ error: 'This draft has already been sent' })
    }

    const lead = draft.lead_id || {}
    const emailTo = lead.email || draft.to || ''
    if (!emailTo) {
      return res.status(400).json({ error: 'No recipient email address found for this draft' })
    }

    const finalSubject = replaceLeadPlaceholders(draft.subject, lead)
    const finalBody = replaceLeadPlaceholders(draft.body, lead)

    let result
    if (account?.provider === 'gmail') {
      result = await sendGmailEmail(account, emailTo, finalSubject, finalBody, '', null, lead.image_url, {
        leadId: lead._id,
        isReply: false
      })
    } else if (account?.provider === 'outlook') {
      result = await sendOutlookEmail(account, emailTo, finalSubject, finalBody, '', null, null, {
        leadId: lead._id,
        isReply: false
      })
    } else {
      result = await sendWebmailEmail(account, emailTo, finalSubject, finalBody, '', null, lead.image_url, {
        leadId: lead._id,
        isReply: false
      })
    }

    if (result?.messageId) {
      const threadId = result.threadId || result.messageId
      
      await Draft.findByIdAndUpdate(draft._id, {
        status: 'sent',
        sent_at: new Date(),
        message_id: result.messageId,
        thread_id: threadId
      })
      
      if (lead._id) {
        await Lead.findByIdAndUpdate(lead._id, { status: 'sent' })
        const campaign = await Campaign.findById(lead.campaign_id).lean()
        if (campaign) {
          try {
            await createFollowupsForLead(lead, campaign)
          } catch (err) {
            console.error('Error creating follow-ups:', err)
          }
        }
      }
      
      const event = new Event({
        lead_id: lead._id || draft.lead_id,
        draft_id: draft._id,
        event_type: 'sent',
        metadata: JSON.stringify({ messageId: result.messageId })
      })
      await event.save()

      return res.json({ success: true, messageId: result.messageId })
    } else {
      if (!res.headersSent) {
        return res.status(500).json({ error: result?.error || 'Failed to send email via webmail' })
      }
    }
  } catch (error) {
    console.error('Error in single send route:', error)
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Failed to send email' })
    }
  }
})

// Test Webmail sending
router.all('/test-webmail', async (req, res) => {
  try {
    const to = req.body?.to || req.query?.to || process.env.WEBMAIL_USER
    if (!to) {
      return res.status(400).json({ error: 'Recipient email address (to) is required' })
    }

    const account = await getActiveAccount()
    console.log(`🧪 Testing Hostinger Webmail send to: ${to}...`)

    const subject = `MailFlow Webmail Test - ${new Date().toLocaleTimeString()}`
    const body = `Hello!\n\nThis is a test email sent from MailFlow using your Hostinger Webmail account (${process.env.WEBMAIL_USER || account?.email}).\n\nIf you received this message, your Hostinger SMTP setup is working perfectly!`

    const result = await sendWebmailEmail(account, to, subject, body)

    if (result.success) {
      res.json({
        success: true,
        message: `Test email sent successfully to ${to} via Hostinger Webmail!`,
        messageId: result.messageId,
        from: process.env.WEBMAIL_USER || account?.email
      })
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to send test email',
        config: {
          host: process.env.WEBMAIL_HOST || 'smtp.hostinger.com',
          port: process.env.WEBMAIL_PORT || '465',
          user: process.env.WEBMAIL_USER
        }
      })
    }
  } catch (error) {
    console.error('Test webmail error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
