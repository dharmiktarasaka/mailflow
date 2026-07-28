import express from 'express'
import mongoose from 'mongoose'
import { Campaign, Lead, Draft, LeadEvent, Followup } from '../db/models.js'

const router = express.Router()

// Generate followup template
router.post('/generate-followup', async (req, res) => {
  try {
    const { campaign, sequence } = req.body
    const { generateFollowupTemplate } = await import('../services/ai.js')
    const template = await generateFollowupTemplate(campaign, sequence)
    res.json(template)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export const DEFAULT_FOLLOWUP_TEMPLATES = [
  {
    sequence: 1,
    delay_days: 3,
    enabled: true,
    subject: 'Re: [subject]',
    body: `Hi [f_name],

I wanted to quickly follow up on my previous message to see if you had a chance to review it.

I'd love to hear your thoughts on how we can help [company_name].

Best regards`
  },
  {
    sequence: 2,
    delay_days: 6,
    enabled: true,
    subject: 'Quick check-in regarding [company_name]',
    body: `Hi [f_name],

Checking in to see if this is on your radar.

We've helped similar companies streamline their outreach. Would you be open for a quick chat this week?

Best regards`
  },
  {
    sequence: 3,
    delay_days: 9,
    enabled: true,
    subject: 'Idea for [company_name]',
    body: `Hi [f_name],

I know you're busy! I just wanted to share one quick idea that could really benefit [company_name].

If you're interested, let me know when might be a good time to connect.

Thanks`
  },
  {
    sequence: 4,
    delay_days: 14,
    enabled: true,
    subject: 'Should I close your file?',
    body: `Hi [f_name],

I haven't heard back, so I assume now might not be the right time for [company_name].

If things change in the future, feel free to reach out anytime. Wish you all the best!

Regards`
  }
]

// Create campaign
router.post('/', async (req, res) => {
  try {
    const { name, master_prompt, subject_template, body_template, followup_templates } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Campaign name is required' })
    }

    const existing = await Campaign.findOne({ name })
    if (existing) {
      return res.status(400).json({ error: 'A campaign with this name already exists' })
    }

    const promptText = master_prompt || body_template || ''
    const templatesToSave = (followup_templates && Array.isArray(followup_templates) && followup_templates.length > 0)
      ? followup_templates
      : DEFAULT_FOLLOWUP_TEMPLATES

    const campaign = new Campaign({
      name,
      master_prompt: promptText,
      subject_template: subject_template || '',
      body_template: body_template || promptText,
      goal: (promptText || name).substring(0, 200),
      tone: 'professional',
      cta_type: 'reply',
      daily_limit: 50,
      delay_min: 45,
      delay_max: 90,
      followup_days: '[3, 6, 9, 14]',
      followup_templates: templatesToSave,
      status: 'draft',
    })

    await campaign.save()

    res.json({ id: campaign._id, success: true })
  } catch (error) {
    console.error('Error in campaign route:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get campaign events
router.get('/events', async (req, res) => {
  try {
    const { campaign_id, lead_id, type } = req.query
    console.log('Fetching events with filter:', { campaign_id, lead_id, type })
    const filter = {}
    
    if (campaign_id) {
      if (mongoose.Types.ObjectId.isValid(campaign_id)) {
        filter.campaign_id = new mongoose.Types.ObjectId(campaign_id)
      } else {
        return res.status(400).json({ error: 'Invalid campaign ID' })
      }
    }
    
    if (lead_id) {
      if (mongoose.Types.ObjectId.isValid(lead_id)) {
        filter.lead_id = new mongoose.Types.ObjectId(lead_id)
      } else {
        return res.status(400).json({ error: 'Invalid lead ID' })
      }
    }
    
    if (type) filter.event_type = type

    const events = await LeadEvent.find(filter).sort({ created_at: -1 }).limit(1000).lean()
    res.json(events)
  } catch (error) {
    console.error('CRITICAL ERROR in /api/campaigns/events:', error)
    res.status(500).json({ 
      error: 'Failed to fetch campaign events',
      details: error.message,
      stack: error.stack
    })
  }
})

// Get all campaigns
router.get('/', async (req, res) => {
  try {
    const campaigns = await Campaign.find().sort({ created_at: -1 }).lean()

    // Add counts manually for now or use aggregate
    // For large datasets, aggregate is better. For this app, lean + map might be fine for small number of campaigns.
    const result = await Promise.all(campaigns.map(async (c) => {
      const lead_count = await Lead.countDocuments({ campaign_id: c._id })
      const sent_count = await Draft.countDocuments({ campaign_id: c._id, status: 'sent' })
      const reply_count = await Lead.countDocuments({ campaign_id: c._id, status: 'replied' })
      
      return {
        ...c,
        id: c._id, // compatibility with frontend which might expect 'id'
        lead_count,
        sent_count,
        reply_count
      }
    }))

    res.json(result)
  } catch (error) {
    console.error('Error in campaign route:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get campaign by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const campaign = await Campaign.findById(id).lean()

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' })
    }

    // Parse JSON fields (if they are stored as strings in Mongoose too)
    // In our Mongoose model we defined them as String, so we still need to parse if frontend expects objects
    campaign.followup_days = JSON.parse(campaign.followup_days || '[]')
    campaign.followup_prompts = JSON.parse(campaign.followup_prompts || '{}')
    if (!campaign.followup_templates || campaign.followup_templates.length === 0) {
      campaign.followup_templates = DEFAULT_FOLLOWUP_TEMPLATES
    }
    campaign.id = campaign._id

    res.json(campaign)
  } catch (error) {
    console.error('Error in campaign route:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update campaign
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      name,
      goal,
      master_prompt,
      subject_template,
      body_template,
      tone,
      cta_type,
      daily_limit,
      delay_min,
      delay_max,
      followup_days,
      followup_prompts,
      followup_templates,
      status,
    } = req.body

    const updateFields = {
      name,
      goal,
      master_prompt,
      subject_template,
      body_template,
      tone,
      cta_type,
      daily_limit,
      delay_min,
      delay_max,
      status,
      updated_at: new Date()
    }

    if (followup_days !== undefined) {
      updateFields.followup_days = typeof followup_days === 'string' ? followup_days : JSON.stringify(followup_days)
    }
    if (followup_prompts !== undefined) {
      updateFields.followup_prompts = typeof followup_prompts === 'string' ? followup_prompts : JSON.stringify(followup_prompts)
    }
    if (followup_templates !== undefined) {
      updateFields.followup_templates = followup_templates
    }

    await Campaign.findByIdAndUpdate(id, updateFields)

    res.json({ success: true })
  } catch (error) {
    console.error('Error in campaign route:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete campaign
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    await Draft.deleteMany({ campaign_id: id })
    await Lead.deleteMany({ campaign_id: id })
    await Campaign.findByIdAndDelete(id)

    res.json({ success: true })
  } catch (error) {
    console.error('Error in campaign route:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get campaign stats
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID format' })
    }

    const campaignId = new mongoose.Types.ObjectId(id)

    const total_leads = await Lead.countDocuments({ campaign_id: campaignId })
    const sent_leads = await Lead.countDocuments({ campaign_id: campaignId, status: 'sent' })
    const replied_leads = await Lead.countDocuments({ campaign_id: campaignId, status: 'replied' })
    const bounced_leads = await Lead.countDocuments({ campaign_id: campaignId, status: 'bounced' })
    const draft_count = await Draft.countDocuments({ campaign_id: campaignId, status: 'draft' })
    const approved_count = await Draft.countDocuments({ campaign_id: campaignId, status: 'approved' })

    res.json({
      total_leads,
      sent_leads,
      replied_leads,
      bounced_leads,
      draft_count,
      approved_count
    })
  } catch (error) {
    console.error('Error in campaign route:', error)
    res.status(500).json({ error: error.message })
  }
})


// Get followups for a campaign
router.get('/:id/followups', async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID' })
    const followups = await Followup.find({ campaign_id: id })
      .populate('lead_id')
      .sort({ 'lead_id.email': 1, sequence: 1 })
      .lean()

    const result = followups.map(f => ({
      ...f,
      id: f._id,
      email: f.lead_id?.email,
      first_name: f.lead_id?.first_name,
      last_name: f.lead_id?.last_name,
    }))
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update a followup
router.put('/:id/followups/:followupId', async (req, res) => {
  try {
    const { followupId } = req.params
    const { subject, body } = req.body
    await Followup.findByIdAndUpdate(followupId, { subject, body, updated_at: new Date() })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete a followup
router.delete('/:id/followups/:followupId', async (req, res) => {
  try {
    const { followupId } = req.params
    await Followup.findByIdAndDelete(followupId)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router

