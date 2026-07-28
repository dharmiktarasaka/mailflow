import express from 'express'
import mongoose from 'mongoose'
import { Draft, Lead, Campaign } from '../db/models.js'
import { generateEmail, summarizeLinkedIn } from '../services/ai.js'

const router = express.Router()

// Get all drafts
router.get('/', async (req, res) => {
  try {
    const { campaign_id, lead_id, status } = req.query

    const filter = {}
    if (campaign_id) {
      if (mongoose.Types.ObjectId.isValid(campaign_id)) {
        filter.campaign_id = new mongoose.Types.ObjectId(campaign_id)
      }
    }
    if (lead_id) {
      if (mongoose.Types.ObjectId.isValid(lead_id)) {
        filter.lead_id = new mongoose.Types.ObjectId(lead_id)
      }
    }
    if (status) filter.status = status

    const drafts = await Draft.find(filter)
      .populate('lead_id')
      .populate('campaign_id')
      .sort({ created_at: -1 })
      .limit(500)
      .lean()

    const result = drafts.map(d => ({
      ...d,
      id: d._id,
      email: d.lead_id?.email,
      first_name: d.lead_id?.first_name,
      last_name: d.lead_id?.last_name,
      company: d.lead_id?.company,
      master_prompt: d.campaign_id?.master_prompt,
      tone: d.campaign_id?.tone,
      cta_type: d.campaign_id?.cta_type
    }))

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get draft by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const draft = await Draft.findById(id)
      .populate('lead_id')
      .populate('campaign_id')
      .lean()

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    const result = {
      ...draft,
      id: draft._id,
      email: draft.lead_id?.email,
      first_name: draft.lead_id?.first_name,
      last_name: draft.lead_id?.last_name,
      company: draft.lead_id?.company,
      website: draft.lead_id?.website,
      title: draft.lead_id?.title,
      enrichment_data: draft.lead_id?.enrichment_data ? JSON.parse(draft.lead_id.enrichment_data) : null,
      master_prompt: draft.campaign_id?.master_prompt,
      tone: draft.campaign_id?.tone,
      cta_type: draft.campaign_id?.cta_type,
      goal: draft.campaign_id?.goal
    }

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update draft
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { subject, body, scheduled_at, status, email } = req.body

    const draft = await Draft.findById(id)
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    if (subject !== undefined) draft.subject = subject
    if (body !== undefined) draft.body = body
    if (scheduled_at !== undefined) draft.scheduled_at = scheduled_at
    if (status !== undefined) draft.status = status
    
    await draft.save()

    // If email is provided, also update the lead's email
    if (email !== undefined && draft.lead_id) {
      await Lead.findByIdAndUpdate(draft.lead_id, { email })
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Approve draft
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params

    console.log(`Approving draft: ${id}`)
    await Draft.findByIdAndUpdate(id, {
      status: 'approved',
      reviewed_at: new Date()
    })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Reject draft
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params

    await Draft.findByIdAndUpdate(id, {
      status: 'rejected',
      reviewed_at: new Date()
    })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Regenerate draft
router.post('/:id/regenerate', async (req, res) => {
  try {
    const { id } = req.params

    const draft = await Draft.findById(id)
      .populate('lead_id')
      .populate('campaign_id')
      .lean()

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    // Regenerate email
    let enrichment = draft.lead_id?.enrichment_data ? JSON.parse(draft.lead_id.enrichment_data) : null

    // Check if we need to summarize LinkedIn
    const lead = draft.lead_id
    if (lead && (lead.linkedin_url || lead.linkedin_data)) {
      if (!enrichment) enrichment = {}
      if (!enrichment.linkedin_summary) {
        try {
          console.log(`Summarizing LinkedIn profile for regenerated draft of ${lead.first_name} ${lead.last_name}`)
          const linkedinSummary = await summarizeLinkedIn(lead.linkedin_url || '', `${lead.first_name || ''} ${lead.last_name || ''}`, lead.linkedin_data || '')
          enrichment.linkedin_summary = linkedinSummary
          await Lead.findByIdAndUpdate(lead._id, { enrichment_data: JSON.stringify(enrichment) })
        } catch (e) {
          console.error(`Failed to summarize LinkedIn during regeneration for ${lead.email}:`, e.message)
        }
      }
    }
    const campaign = {
      goal: draft.campaign_id?.goal,
      master_prompt: draft.campaign_id?.master_prompt,
      tone: draft.campaign_id?.tone,
      cta_type: draft.campaign_id?.cta_type,
    }

    const leadData = {
      ...draft.lead_id,
      id: draft.lead_id?._id
    }

    const email = await generateEmail(leadData, enrichment, campaign, draft.sequence)

    await Draft.findByIdAndUpdate(id, {
      subject: email.subject,
      body: email.body,
      updated_at: new Date()
    })

    res.json({ success: true, subject: email.subject, body: email.body })
  } catch (error) {
    console.error('Regenerate error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Bulk approve
router.post('/bulk/approve', async (req, res) => {
  try {
    const { ids } = req.body

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'No IDs provided' })
    }

    await Draft.updateMany(
      { _id: { $in: ids } },
      { 
        status: 'approved', 
        reviewed_at: new Date() 
      }
    )

    res.json({ success: true, updated: ids.length })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete draft
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const draft = await Draft.findById(id)
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    if (draft.status === 'draft') {
      await Draft.findByIdAndDelete(id)
      res.json({ success: true, deleted: true })
    } else {
      draft.status = 'draft'
      draft.scheduled_at = undefined
      draft.reviewed_at = undefined
      await draft.save()
      res.json({ success: true, reverted: true })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router ;

