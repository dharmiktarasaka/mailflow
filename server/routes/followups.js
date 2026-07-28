import express from 'express'
import { Followup, Lead, Campaign } from '../db/models.js'
import { generateEmail, summarizeLinkedIn } from '../services/ai.js'

const router = express.Router()

// Get all followups
router.get('/', async (req, res) => {
  try {
    const { status, campaign_id, sequence, date, limit } = req.query

    const filter = {}
    if (status) filter.status = status
    if (campaign_id) filter.campaign_id = campaign_id
    if (sequence) filter.sequence = sequence

    if (date) {
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      // scheduled_date is now stored as Date type
      filter.scheduled_date = { $gte: startOfDay, $lte: endOfDay }
    }

    const maxResults = parseInt(limit) || 500
    const followups = await Followup.find(filter)
      .populate('lead_id')
      .populate('campaign_id')
      .sort({ scheduled_date: 1, sequence: 1 })
      .limit(maxResults)
      .lean()

    const result = followups.map(f => ({
      ...f,
      id: f._id,
      email: f.lead_id?.email,
      first_name: f.lead_id?.first_name,
      last_name: f.lead_id?.last_name,
      company: f.lead_id?.company,
      goal: f.campaign_id?.goal,
      master_prompt: f.campaign_id?.master_prompt,
      tone: f.campaign_id?.tone,
      cta_type: f.campaign_id?.cta_type
    }))

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get followup by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const followup = await Followup.findById(id)
      .populate('lead_id')
      .populate('campaign_id')
      .lean()

    if (!followup) {
      return res.status(404).json({ error: 'Follow-up not found' })
    }

    const result = {
      ...followup,
      id: followup._id,
      email: followup.lead_id?.email,
      first_name: followup.lead_id?.first_name,
      last_name: followup.lead_id?.last_name,
      company: followup.lead_id?.company,
      website: followup.lead_id?.website,
      title: followup.lead_id?.title,
      enrichment_data: followup.lead_id?.enrichment_data ? JSON.parse(followup.lead_id.enrichment_data) : null,
      goal: followup.campaign_id?.goal,
      master_prompt: followup.campaign_id?.master_prompt,
      tone: followup.campaign_id?.tone,
      cta_type: followup.campaign_id?.cta_type
    }

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create followup
router.post('/', async (req, res) => {
  try {
    const { lead_id, campaign_id, sequence, scheduled_date, auto_cancel_on_reply } = req.body

    // Get lead and campaign data for AI generation
    const lead = await Lead.findById(lead_id).lean()
    const campaign = await Campaign.findById(campaign_id).lean()

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' })
    }

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' })
    }

    let enrichmentData = lead?.enrichment_data ? JSON.parse(lead.enrichment_data) : null

    // Check if we need to summarize LinkedIn
    if (lead && lead.linkedin_url) {
      if (!enrichmentData) enrichmentData = {}
      if (!enrichmentData.linkedin_summary) {
        try {
          console.log(`Summarizing LinkedIn profile for manual followup: ${lead.linkedin_url}`)
          const linkedinSummary = await summarizeLinkedIn(lead.linkedin_url, `${lead.first_name || ''} ${lead.last_name || ''}`)
          enrichmentData.linkedin_summary = linkedinSummary
          await Lead.findByIdAndUpdate(lead._id, { enrichment_data: JSON.stringify(enrichmentData) })
        } catch (e) {
          console.error(`Failed to summarize LinkedIn during manual followup creation:`, e.message)
        }
      }
    }

    let finalScheduledDate = scheduled_date
    if (scheduled_date) {
      const dateObj = new Date(scheduled_date)
      if (!isNaN(dateObj.getTime())) {
        const isPositive = Math.random() < 0.5
        const minutes = Math.floor(Math.random() * (60 - 20 + 1)) + 20
        const offsetMs = minutes * 60 * 1000
        if (isPositive) {
          dateObj.setTime(dateObj.getTime() + offsetMs)
        } else {
          dateObj.setTime(dateObj.getTime() - offsetMs)
        }
        finalScheduledDate = dateObj
      }
    }

    // Create followup with placeholder values first
    const followup = new Followup({
      lead_id,
      campaign_id,
      sequence: sequence || 1,
      subject: '', // Will be filled by AI
      body: '',    // Will be filled by AI
      scheduled_date: finalScheduledDate,
      status: 'pending',
      auto_cancel_on_reply: auto_cancel_on_reply ?? true
    })

    // Save the followup to get an ID
    await followup.save()

    // Generate AI content for the followup
    try {
      const email = await generateEmail(
        {
          first_name: lead.first_name,
          last_name: lead.last_name,
          email: lead.email,
          company: lead.company,
          website: lead.website,
          title: lead.title
        },
        enrichmentData,
        {
          goal: campaign.goal,
          master_prompt: campaign.master_prompt,
          tone: campaign.tone,
          cta_type: campaign.cta_type
        },
        followup.sequence
      )

      // Update the followup with AI-generated content
      followup.subject = email.subject
      followup.body = email.body
      followup.updated_at = new Date()
      await followup.save()
    } catch (aiError) {
      console.error('AI generation failed for followup:', aiError)
      // If AI generation fails, we still have the followup with empty subject/body
      // The user can manually fill it or regenerate later
    }

    res.json({ success: true, id: followup._id })
  } catch (error) {
    console.error('Failed to create followup:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update followup
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { subject, body, scheduled_date, status } = req.body

    const update = {}
    if (subject !== undefined) update.subject = subject
    if (body !== undefined) update.body = body
    if (scheduled_date !== undefined) update.scheduled_date = scheduled_date
    if (status !== undefined) update.status = status
    update.updated_at = new Date()

    await Followup.findByIdAndUpdate(id, update)

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Approve followup
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params
    await Followup.findByIdAndUpdate(id, { status: 'approved' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Reject followup
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params
    await Followup.findByIdAndUpdate(id, { status: 'cancelled' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete followup
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    await Followup.findByIdAndDelete(id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Generate followup content using AI
router.post('/:id/generate', async (req, res) => {
  try {
    const { id } = req.params

    const followup = await Followup.findById(id)
      .populate('lead_id')
      .populate('campaign_id')
      .lean()

    if (!followup) {
      return res.status(404).json({ error: 'Follow-up not found' })
    }

    let enrichmentData = followup.lead_id?.enrichment_data ? JSON.parse(followup.lead_id.enrichment_data) : null

    // Check if we need to summarize LinkedIn
    const lead = followup.lead_id
    if (lead && (lead.linkedin_url || lead.linkedin_data)) {
      if (!enrichmentData) enrichmentData = {}
      if (!enrichmentData.linkedin_summary) {
        try {
          console.log(`Summarizing LinkedIn profile for followup regeneration`)
          const linkedinSummary = await summarizeLinkedIn(lead.linkedin_url || '', `${lead.first_name || ''} ${lead.last_name || ''}`, lead.linkedin_data || '')
          enrichmentData.linkedin_summary = linkedinSummary
          await Lead.findByIdAndUpdate(lead._id, { enrichment_data: JSON.stringify(enrichmentData) })
        } catch (e) {
          console.error(`Failed to summarize LinkedIn during followup regeneration:`, e.message)
        }
      }
    }

    const campaign = {
      goal: followup.campaign_id?.goal,
      master_prompt: followup.campaign_id?.master_prompt,
      tone: followup.campaign_id?.tone,
      cta_type: followup.campaign_id?.cta_type,
    }

    const leadData = {
      first_name: followup.lead_id?.first_name,
      last_name: followup.lead_id?.last_name,
      email: followup.lead_id?.email,
      company: followup.lead_id?.company,
      website: followup.lead_id?.website,
      title: followup.lead_id?.title,
      linkedin_url: followup.lead_id?.linkedin_url,
    }

    const email = await generateEmail(leadData, enrichmentData, campaign, followup.sequence)

    await Followup.findByIdAndUpdate(id, {
      subject: email.subject,
      body: email.body,
      updated_at: new Date()
    })

    res.json(email)
  } catch (error) {
    console.error('Generate error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Create followups for a campaign based on campaign settings
router.post('/create-for-campaign/:campaign_id', async (req, res) => {
  try {
    const { campaign_id } = req.params

    const campaign = await Campaign.findById(campaign_id).lean()
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' })
    }

    let followupDays = []
    if (campaign.followup_days) {
      try {
        followupDays = JSON.parse(campaign.followup_days)
      } catch (e) {
        followupDays = [3, 7]
      }
    }

    // Get leads that have been sent
    const sentLeads = await Lead.find({ campaign_id, status: 'sent' }).lean()

    let created = 0

    for (const lead of sentLeads) {
      for (let i = 0; i < followupDays.length; i++) {
        const days = followupDays[i]
        let scheduledDate = new Date()
        if (typeof days === 'number') {
          scheduledDate.setDate(scheduledDate.getDate() + days)
        } else if (typeof days === 'object' && days !== null) {
          if (days.type === 'date' && days.date) {
            scheduledDate = new Date(days.date)
          } else if (days.type === 'hours') {
            scheduledDate.setHours(scheduledDate.getHours() + (days.value || 0))
          } else if (days.type === 'minutes') {
            scheduledDate.setMinutes(scheduledDate.getMinutes() + (days.value || 0))
          } else {
            scheduledDate.setDate(scheduledDate.getDate() + (days.value || 0))
          }
        }

        // Add random human-like jitter (+/- 20 to 60 minutes)
        const isPositive = Math.random() < 0.5
        const minutes = Math.floor(Math.random() * (60 - 20 + 1)) + 20
        const offsetMs = minutes * 60 * 1000
        if (isPositive) {
          scheduledDate.setTime(scheduledDate.getTime() + offsetMs)
        } else {
          scheduledDate.setTime(scheduledDate.getTime() - offsetMs)
        }

        // Check if followup already exists
        const existing = await Followup.findOne({ lead_id: lead._id, sequence: i + 1 })

        if (!existing) {
          // Create followup with placeholder values first
          const followup = new Followup({
            lead_id: lead._id,
            campaign_id,
            sequence: i + 1,
            subject: '', // Will be filled by AI
            body: '',    // Will be filled by AI
            scheduled_date: scheduledDate.toISOString(),
            status: 'pending',
            auto_cancel_on_reply: true
          })
          await followup.save()

          // Generate AI content for the followup
          try {
            const leadData = {
              first_name: lead.first_name,
              last_name: lead.last_name,
              email: lead.email,
              company: lead.company,
              website: lead.website,
              title: lead.title
            }

            let enrichmentData = lead.enrichment_data ? JSON.parse(lead.enrichment_data) : null

            // Check if we need to summarize LinkedIn
            if (lead.linkedin_url || lead.linkedin_data) {
              if (!enrichmentData) enrichmentData = {}
              if (!enrichmentData.linkedin_summary) {
                try {
                  console.log(`Summarizing LinkedIn profile for campaign followup`)
                  const linkedinSummary = await summarizeLinkedIn(lead.linkedin_url || '', `${lead.first_name || ''} ${lead.last_name || ''}`, lead.linkedin_data || '')
                  enrichmentData.linkedin_summary = linkedinSummary
                  await Lead.findByIdAndUpdate(lead._id, { enrichment_data: JSON.stringify(enrichmentData) })
                } catch (e) {
                  console.error('LinkedIn error:', e.message)
                }
              }
            }

            const email = await generateEmail(
              leadData,
              enrichmentData,
              {
                goal: campaign.goal,
                master_prompt: campaign.master_prompt,
                tone: campaign.tone,
                cta_type: campaign.cta_type
              },
              followup.sequence
            )

            // Update the followup with AI-generated content
            followup.subject = email.subject
            followup.body = email.body
            followup.updated_at = new Date()
            await followup.save()
          } catch (aiError) {
            console.error('AI generation failed for followup:', aiError)
            // If AI generation fails, we still have the followup with empty subject/body
            // The user can manually fill it or regenerate later
          }

          created++
        }
      }
    }

    res.json({ success: true, created })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router