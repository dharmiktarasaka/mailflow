import express from 'express'
import mongoose from 'mongoose'
import { Account, Draft, Lead, LeadEvent, Followup } from '../db/models.js'
import { getGmailReplies } from '../services/gmail.js'
import { getOutlookReplies } from '../services/outlook.js'

const router = express.Router()

// Internal poll function
export async function pollRepliesInternal() {
  try {
    const { ensureHostingerAccount } = await import('../services/webmail.js')
    await ensureHostingerAccount()
  } catch (e) {}

  let accounts = []
  try {
    accounts = await Account.find({ is_active: true })
  } catch (err) {
    console.error('Error fetching accounts for polling:', err.message)
    return { success: true, message: 'Database initializing', accounts_polled: 0, replies_found: 0, matched: 0 }
  }

  if (!accounts || accounts.length === 0) {
    return { success: true, message: 'No active email accounts', accounts_polled: 0, replies_found: 0, matched: 0 }
  }

  let totalRepliesFound = 0
  let totalMatched = 0

  for (const account of accounts) {
    console.log(`🔍 Polling account: ${account.email} (${account.provider})`)
    let replies = []

    try {
      if (account.provider === 'gmail') {
        replies = await getGmailReplies(account)
      } else if (account.provider === 'outlook') {
        replies = await getOutlookReplies(account)
      }
      console.log(`✅ Found ${replies.length} raw replies for ${account.email}`)
    } catch (pollErr) {
      console.error(`Failed to poll ${account.email}:`, pollErr.message)
      continue
    }

    totalRepliesFound += replies.length

    // Match replies to drafts and update leads
    for (const reply of replies) {
      console.log(`🔍 Processing reply from: ${reply.from}`)
      // 1. Try technical match (Thread/Message ID)
      let draft = await Draft.findOne({
        $or: [
          { thread_id: reply.threadId },
          { message_id: reply.inReplyTo }
        ]
      }).populate('lead_id')

      let lead = draft?.lead_id

      // 2. Fallback: Match by Email Address if no technical match (Case-insensitive)
      if (!lead) {
        console.log(`⚠️ No technical match for reply from ${reply.from}, trying email fallback...`)
        // Extract email address from "Name <email@domain.com>" format if needed
        const emailMatch = reply.from.match(/<([^>]+)>/)
        const emailToCheck = emailMatch ? emailMatch[1].toLowerCase().trim() : reply.from.toLowerCase().trim()
        
        // Prioritize finding a lead that is actually waiting for a reply ('sent' status)
        lead = await Lead.findOne({ email: emailToCheck, status: 'sent' }).sort({ created_at: -1 })
        
        if (!lead) {
          lead = await Lead.findOne({ email: emailToCheck }).sort({ created_at: -1 })
        }
        
        // Also try checking if lead email matches the reply from (in case it's stored differently)
        if (!lead && reply.from.includes('@')) {
          const regexEmail = new RegExp(`^${reply.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
          lead = await Lead.findOne({ email: { $regex: regexEmail }, status: 'sent' }).sort({ created_at: -1 })
          if (!lead) lead = await Lead.findOne({ email: { $regex: regexEmail } }).sort({ created_at: -1 })
        }
        
        // Grab the most recent sent draft for this lead so it can be updated
        if (lead && !draft) {
          draft = await Draft.findOne({ lead_id: lead._id, status: 'sent' }).sort({ sent_at: -1, created_at: -1 })
        }
      }

      if (lead) {
        // Check if this reply event was already logged
        const existingEvent = await LeadEvent.findOne({
          lead_id: lead._id,
          event_type: 'replied',
          'metadata': { $regex: reply.messageId }
        })

        if (!existingEvent) {
          // Update lead status
          await Lead.findByIdAndUpdate(lead._id, { 
            status: 'replied',
            replied: true,
            repliedAt: new Date()
          })

          // Log reply event
          const event = new LeadEvent({
            lead_id: lead._id,
            draft_id: draft?._id || null, // Might be null if matched by email
            event_type: 'replied',
            metadata: JSON.stringify({
              from: reply.from,
              subject: reply.subject,
              body_snippet: reply.body,
              messageId: reply.messageId
            }),
          })
          await event.save()

          // Cancel pending and approved follow-ups (only those with auto_cancel_on_reply enabled)
          await Followup.updateMany(
            { 
              lead_id: lead._id, 
              status: { $in: ['pending', 'approved'] },
              auto_cancel_on_reply: true 
            },
            { status: 'cancelled' }
          )

          // Mark lead's status in dashboard
          if (draft) {
            await Draft.findByIdAndUpdate(draft._id, { status: 'replied' })
          }

          totalMatched++
        }
      }
    }
  }

  return { success: true, accounts_polled: accounts.length, replies_found: totalRepliesFound, matched: totalMatched }
}

// Poll for replies
router.post('/poll', async (req, res) => {
  try {
    const result = await pollRepliesInternal()
    res.json(result)
  } catch (error) {
    console.error('Poll route error:', error)
    res.json({ success: true, accounts_polled: 0, replies_found: 0, matched: 0 })
  }
})

// Get all conversations (leads with activity)
router.get('/replies', async (req, res) => {
  try {
    const { limit = 50 } = req.query

    // 1. Find all leads with any activity (Sent drafts or LeadEvents)
    const [leadIdsFromDrafts, leadIdsFromLeadEvents] = await Promise.all([
      Draft.find({ status: 'sent' }).distinct('lead_id'),
      LeadEvent.find({ event_type: { $in: ['sent', 'replied', 'followup_sent'] } }).distinct('lead_id')
    ])

    // Combine and unique lead IDs
    const allActiveLeadIds = [...new Set([
      ...leadIdsFromDrafts.map(id => id.toString()),
      ...leadIdsFromLeadEvents.map(id => id.toString())
    ])]

    if (!allActiveLeadIds.length) {
      return res.json([])
    }

    // 2. For each lead, get their latest interaction to show in the list
    const conversations = await Promise.all(allActiveLeadIds.map(async (leadId) => {
      const lead = await Lead.findById(leadId).lean()
      if (!lead) return null

      // Find latest event or latest sent draft
      const [latestLeadEvent, latestDraft] = await Promise.all([
        LeadEvent.findOne({ lead_id: leadId }).sort({ created_at: -1 }).populate('draft_id').lean(),
        Draft.findOne({ lead_id: leadId, status: 'sent' }).sort({ sent_at: -1 }).lean()
      ])

      const eventDate = latestLeadEvent ? new Date(latestLeadEvent.created_at) : new Date(0)
      const draftDate = latestDraft ? new Date(latestDraft.sent_at || latestDraft.created_at) : new Date(0)

      const isLeadEventNewer = eventDate >= draftDate
      const latest = isLeadEventNewer ? latestLeadEvent : latestDraft
      const date = isLeadEventNewer ? eventDate : draftDate

      return {
        id: lead._id,
        lead_id: lead,
        lead_email: lead.email,
        first_name: lead.first_name,
        last_name: lead.last_name,
        subject: (isLeadEventNewer ? (latestLeadEvent.draft_id?.subject || 'Reply') : latestDraft.subject) || 'Outreach',
        date: date,
        event_type: isLeadEventNewer ? latestLeadEvent.event_type : 'sent',
        metadata: isLeadEventNewer && latestLeadEvent.metadata ? JSON.parse(latestLeadEvent.metadata) : null,
        body_snippet: isLeadEventNewer && latestLeadEvent.metadata ? JSON.parse(latestLeadEvent.metadata).body_snippet : (latestDraft?.body?.substring(0, 100) || '')
      }
    }))

    // Filter out nulls and sort by date descending
    const result = conversations
      .filter(c => c !== null)
      .sort((a, b) => b.date - a.date)
      .slice(0, parseInt(limit))

    res.json(result)
  } catch (error) {
    console.error('Error in inbox replies:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get replies for campaign
router.get('/campaign/:campaign_id', async (req, res) => {
  try {
    const { campaign_id } = req.params

    if (!mongoose.Types.ObjectId.isValid(campaign_id)) {
      return res.status(400).json({ error: 'Invalid campaign ID format' })
    }

    const campaignObjectId = new mongoose.Types.ObjectId(campaign_id)

    // Find leads for this campaign
    const leads = await Lead.find({ campaign_id: campaignObjectId }).select('_id').lean()
    const leadIds = leads.map(l => l._id)

    const events = await LeadEvent.find({ 
      event_type: 'replied', 
      lead_id: { $in: leadIds } 
    })
      .populate('lead_id')
      .populate('draft_id')
      .sort({ created_at: -1 })
      .lean()

    const result = events.map(e => ({
      ...e,
      id: e._id,
      email: e.lead_id?.email,
      first_name: e.lead_id?.first_name,
      last_name: e.lead_id?.last_name,
      subject: e.draft_id?.subject,
      metadata: e.metadata ? JSON.parse(e.metadata) : null
    }))

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Mark reply as read
router.post('/replies/:id/read', async (req, res) => {
  try {
    const { id } = req.params
    const event = await LeadEvent.findById(id)
    if (event) {
      let metadata = {}
      try {
        metadata = JSON.parse(event.metadata || '{}')
      } catch (e) {}
      metadata.read = 1
      event.metadata = JSON.stringify(metadata)
      await event.save()
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Send a reply
router.post('/reply', async (req, res) => {
  try {
    const { lead_id, body } = req.body
    console.log('Incoming reply request:', { lead_id, body: body ? 'exists' : 'missing' })

    if (!lead_id || !body) {
      return res.status(400).json({ error: 'Lead ID and body are required' })
    }

    const account = await Account.findOne({ is_active: true })
    console.log('Account found for reply:', account ? account.email : 'NONE')

    if (!account) {
      return res.status(400).json({ error: 'No active email account' })
    }

    const lead = await Lead.findById(lead_id)
    console.log('Lead found for reply:', lead ? lead.email : 'NONE')
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' })
    }

    // Find the original draft or latest message to get thread ID
    const draft = await Draft.findOne({ lead_id, status: 'replied' }).sort({ created_at: -1 })
    
    // Fallback to any draft for this lead
    const referenceDraft = draft || await Draft.findOne({ lead_id }).sort({ created_at: -1 })

    const threadId = referenceDraft?.thread_id
    const subject = referenceDraft ? `Re: ${referenceDraft.subject}` : 'Re: Outreach'

    let result
    if (account.provider === 'gmail') {
      const { sendGmailEmail } = await import('../services/gmail.js')
      result = await sendGmailEmail(account, lead.email, subject, body, '', threadId, null, { 
        isReply: true, 
        messageId: referenceDraft?.message_id || lead.messageId 
      })
    } else if (account.provider === 'outlook') {
      const { sendOutlookEmail } = await import('../services/outlook.js')
      result = await sendOutlookEmail(account, lead.email, subject, body, '', threadId, null, { 
        isReply: true, 
        messageId: referenceDraft?.message_id || lead.messageId 
      })
    } else {
      const { sendWebmailEmail } = await import('../services/webmail.js')
      result = await sendWebmailEmail(account, lead.email, subject, body, '', threadId, null, { 
        isReply: true, 
        messageId: referenceDraft?.message_id || lead.messageId 
      })
    }

    if (result.success) {
      // Create a record of this reply as a draft (but marked as sent/reply)
      const replyDraft = new Draft({
        lead_id,
        campaign_id: lead.campaign_id,
        subject,
        body,
        status: 'sent',
        message_id: result.messageId,
        thread_id: result.threadId || threadId,
        is_reply: true,
      })
      await replyDraft.save()

      // Log event
      const event = new LeadEvent({
        lead_id,
        draft_id: replyDraft._id,
        event_type: 'sent',
        metadata: JSON.stringify({ type: 'reply', body_snippet: body.substring(0, 100) }),
      })
      await event.save()

      res.json({ success: true, messageId: result.messageId })
    } else {
      res.status(500).json({ error: result.error })
    }
  } catch (error) {
    console.error('CRITICAL ERROR in /api/inbox/reply:', error)
    res.status(500).json({ 
      error: 'Failed to send reply',
      details: error.message,
      stack: error.stack
    })
  }
})

export default router