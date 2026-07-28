import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import axios from 'axios'
import { initializeDatabase } from './db/db.js'
import { Config, Account, Draft, LeadEvent, Lead, Followup } from './db/models.js'
import authRoutes from './routes/auth.js'
import configRoutes from './routes/config.js'
import campaignRoutes from './routes/campaigns.js'
import leadRoutes from './routes/leads.js'
import draftRoutes from './routes/drafts.js'
import sendRoutes from './routes/send.js'
import inboxRoutes, { pollRepliesInternal } from './routes/inbox.js'
import { decryptTokenSafely } from './services/crypto.js'
import { ensureHostingerAccount, getActiveAccount } from './services/webmail.js'
import { replaceLeadPlaceholders } from './services/leadUtils.js'
import dashboardRoutes from './routes/dashboard.js'
import trackingRoutes from './routes/tracking.js'
import followupRoutes from './routes/followups.js'
import backupRoutes from './routes/backup.js'

import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '.env'), override: true })

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Initialize database and start server
async function start() {
  try {
    await initializeDatabase()
    console.log('Database initialized successfully')
    await ensureHostingerAccount()

    // Set default redirect URIs (required for OAuth)
    process.env.GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3001/auth/gmail/callback'
    process.env.OUTLOOK_REDIRECT_URI = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:3001/auth/outlook/callback'

    // Load credentials from database
    try {
      const config = await Config.findOne({ key: 'credentials' })
      if (config && config.value) {
        const creds = JSON.parse(config.value)
        if (creds.gmail_client_id) {
          process.env.GMAIL_CLIENT_ID = creds.gmail_client_id
          console.log('✓ Loaded Gmail Client ID from database')
        }
        if (creds.gmail_client_secret) {
          process.env.GMAIL_CLIENT_SECRET = decryptTokenSafely(creds.gmail_client_secret)
          console.log('✓ Loaded Gmail Client Secret from database')
        }
        if (creds.anthropic_api_key) {
          process.env.ANTHROPIC_API_KEY = decryptTokenSafely(creds.anthropic_api_key)
          console.log('✓ Loaded Anthropic API Key from database')
        }
      }
    } catch (err) {
      console.log('No saved credentials found, using .env file')
    }

    // Routes
    app.use('/auth', authRoutes)
    app.use('/api/config', configRoutes)
    app.use('/api/campaigns', campaignRoutes)
    app.use('/api/leads', leadRoutes)
    app.use('/api/drafts', draftRoutes)
    app.use('/api/send', sendRoutes)
    app.use('/api/inbox', inboxRoutes)
    app.use('/api/dashboard', dashboardRoutes)
    app.use('/api/tracking', trackingRoutes)
    app.use('/api/followups', followupRoutes)
    app.use('/api/backups', backupRoutes)

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ error: 'Not found' })
    })

    // Error handler
    app.use((err, req, res, next) => {
      console.error('SERVER ERROR:', err.message)
      console.error(err.stack)
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      })
    })

    // Scheduler - check for scheduled drafts every minute
    setInterval(async () => {
      try {
        const now = new Date()
        console.log('🔍 Scheduler running at', now.toISOString())

        // Get current time in UTC and add timezone offset for IST (UTC+5:30 = 330 minutes)
        const nowIST = new Date(now.getTime() + (5.5 * 60 * 60 * 1000))

        const scheduledDrafts = await Draft.find({
          status: 'scheduled',
          scheduled_at: { $lte: nowIST }
        }).populate('lead_id').populate('campaign_id').limit(10)

        console.log('📅 Found', scheduledDrafts.length, 'scheduled drafts')

        for (const draft of scheduledDrafts) {
          const lead = draft.lead_id
          const campaign = draft.campaign_id

          if (!lead) {
            console.log('⚠️ Lead not found for draft', draft._id)
            continue
          }

          console.log('➡️ Processing draft', draft._id, 'to', lead.email)
          try {
            const account = await getActiveAccount()
            if (!account) {
              console.log('No active account for scheduled email')
              continue
            }

            // Replace placeholders in subject and body with actual lead data & custom excel fields
            let processedSubject = replaceLeadPlaceholders(draft.subject, lead)
            let processedBody = replaceLeadPlaceholders(draft.body, lead)

            let result
            if (account.provider === 'gmail') {
              const { sendGmailEmail } = await import('./services/gmail.js')
              result = await sendGmailEmail(account, lead.email, processedSubject, processedBody, '', null, null, {
                leadId: lead._id,
                isReply: false
              })
            } else if (account.provider === 'outlook') {
              const { sendOutlookEmail } = await import('./services/outlook.js')
              result = await sendOutlookEmail(account, lead.email, processedSubject, processedBody, '', null, null, {
                leadId: lead._id,
                isReply: false
              })
            } else {
              const { sendWebmailEmail } = await import('./services/webmail.js')
              result = await sendWebmailEmail(account, lead.email, processedSubject, processedBody, '', null, null, {
                leadId: lead._id,
                isReply: false
              })
            }

            if (result?.messageId) {
              draft.status = 'sent'
              draft.sent_at = new Date()
              await draft.save()

              await LeadEvent.create({
                lead_id: lead._id,
                draft_id: draft._id,
                event_type: 'sent',
                metadata: JSON.stringify({ messageId: result.messageId })
              })

              console.log(`✓ Sent scheduled email to ${lead.email}`)
            } else {
              console.log('⚠️ No messageId returned for draft', draft._id)
            }
          } catch (err) {
            console.error(`❌ Failed to send scheduled email to ${lead.email}:`, err.message)
          }
        }
      } catch (err) {
        console.error('Scheduler error:', err.message)
      }
    }, 60000)

    // Poll for new email replies every minute
    const pollReplies = async () => {
      try {
        console.log('🔍 Polling for new email replies...')
        await pollRepliesInternal()
        console.log('✅ Finished polling for new email replies')
      } catch (err) {
        console.error('❌ Error polling for new email replies:', err.message)
      }
    }
    
    // Initial poll
    setTimeout(pollReplies, 5000)
    
    setInterval(pollReplies, 60000)

// Follow-up scheduler - check for scheduled follow-ups every minute
// Sends follow-ups that are due (scheduled_date <= now) and have status 'pending'
     setInterval(async () => {
       try {
         const now = new Date();
         const day = now.getDay();
         // Do not send follow-ups on weekends
         if (day === 0 || day === 6) {
           return;
         }

         // Auto-cancel pending follow-ups if lead has replied (BEFORE sending)
         const repliedLeadEvents = await LeadEvent.find({ event_type: 'replied' }).distinct('lead_id');
         
         if (repliedLeadEvents.length > 0) {
           await Followup.updateMany(
             { 
               lead_id: { $in: repliedLeadEvents }, 
               status: 'pending',
               auto_cancel_on_reply: true
             },
             { status: 'cancelled' }
           );
         }
         
         // We look for follow-ups that are pending and due
         const scheduledFollowups = await Followup.find({
           status: 'pending',
           scheduled_date: { $lte: now }
         }).populate('lead_id').populate('campaign_id').limit(10);
         
         if (scheduledFollowups.length > 0) {
           console.log('📧 Found', scheduledFollowups.length, 'scheduled follow-ups to send');
         }
         
         for (const followup of scheduledFollowups) {
           const lead = followup.lead_id;
           const campaign = followup.campaign_id;
           
           if (!lead) continue;
           
           if (lead.replied === true) {
             console.log(`Skipping follow-up for ${lead.email} — recipient already replied`);
             followup.status = 'cancelled';
             await followup.save();
             continue;
           }
           
           console.log('➡️ Sending follow-up', followup._id, 'to', lead.email);
           try {
             const account = await getActiveAccount();
             if (!account) {
               console.log('No active account for follow-up');
               continue;
             }
             
             // Replace placeholders in subject and body with actual lead data
             let processedSubject = replaceLeadPlaceholders(followup.subject, lead)
             let processedBody = replaceLeadPlaceholders(followup.body, lead)
             
             // Get threading information from lead for proper email threading
             let threadId = null
             let originalSubject = null
             const leadInfo = await Lead.findById(lead._id)
             if (leadInfo) {
               threadId = leadInfo.threadId
               originalSubject = leadInfo.originalSubject
               // For Gmail, we use threadId; for Outlook, we use messageId as the reference
               if (!threadId && leadInfo.messageId) {
                 // Fallback to messageId if threadId not available
                 threadId = leadInfo.messageId
               }
             }
             
             // Only override with campaign setting if explicitly enabled
             if (campaign?.reply_to_thread && !threadId) {
               const firstEmail = await Draft.findOne({
                 lead_id: lead._id,
                 status: 'sent',
                 thread_id: { $ne: null }
               }).sort({ sent_at: 1 });
               
               threadId = firstEmail?.thread_id || firstEmail?.message_id || null
               if (threadId && !originalSubject) {
                 // Get original subject from the first sent email
                 const firstDraft = await Draft.findOne({
                   lead_id: lead._id,
                   status: 'sent'
                 }).sort({ sent_at: 1 })
                 originalSubject = firstDraft?.subject
               }
             }
             
             // Determine if this is a reply (follow-up) or initial email
             const isInitialEmail = !threadId || !originalSubject
             let subjectToUse = followup.subject
             let bodyToUse = followup.body
             
             // For follow-ups, if we have original subject, use Re: prefix
             if (!isInitialEmail && originalSubject) {
               // Only add Re: prefix if it's not already there
               if (!followup.subject.startsWith('Re: ')) {
                 subjectToUse = `Re: ${originalSubject}`
               }
               // Use the follow-up body as provided
               bodyToUse = followup.body
             }
             
             let result
             if (account.provider === 'gmail') {
               const { sendGmailEmail } = await import('./services/gmail.js')
               result = await sendGmailEmail(account, lead.email, subjectToUse, bodyToUse, '', threadId, null, {
                 leadId: lead._id,
                 isReply: !isInitialEmail,
                 messageId: leadInfo?.messageId
               })
             } else if (account.provider === 'outlook') {
               const { sendOutlookEmail } = await import('./services/outlook.js')
               // For Outlook, we need to pass the original messageId for threading in the options
               const outlookThreadId = threadId || (leadInfo && leadInfo.messageId) || null
               result = await sendOutlookEmail(account, lead.email, subjectToUse, bodyToUse, '', outlookThreadId, null, {
                 leadId: lead._id,
                 isReply: !isInitialEmail,
                 messageId: leadInfo?.messageId
               })
             } else {
               const { sendWebmailEmail } = await import('./services/webmail.js')
               result = await sendWebmailEmail(account, lead.email, subjectToUse, bodyToUse, '', threadId, null, {
                 leadId: lead._id,
                 isReply: !isInitialEmail,
                 messageId: leadInfo?.messageId
               })
             }
             
             if (result?.messageId) {
               followup.status = 'sent'
               followup.sent_at = new Date()
               await followup.save()
               
               await LeadEvent.create({
                 lead_id: lead._id,
                 event_type: 'followup_sent',
                 metadata: JSON.stringify({ messageId: result.messageId, followup_id: followup._id })
               })
               
               console.log(`✓ Sent follow-up to ${lead.email}`)
             }
           } catch (err) {
             console.error(`❌ Failed to send follow-up to ${lead.email}:`, err.message)
             
             // Mark as failed so it doesn't keep retrying
             followup.status = 'failed';
             await followup.save();
           }
         }
       } catch (err) {
         console.error('Follow-up scheduler error:', err.message)
       }
     }, 60000)

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`✓ MailFlow server running on http://localhost:${PORT}`)
    })

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please close the existing server process on port ${PORT}.`)
      } else {
        console.error('❌ Server startup error:', err.message)
      }
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

start()
