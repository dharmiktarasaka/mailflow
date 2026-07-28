import express from 'express'
import multer from 'multer'
import { read, utils } from 'xlsx'
import dns from 'dns'
import { promisify } from 'util'
import { Lead, Campaign, Draft, LeadEvent as Event, Followup, ImportLog } from '../db/models.js'
import { sleep } from '../services/ai.js'
import { enrichLeadBatch } from '../services/enrichment.js'
import { generateEmailBatch, generatePersonalizedEmail, summarizeLinkedIn } from '../services/ai.js'
import { detectColumns, parseExcelSheetData, replaceLeadPlaceholders, ensureLeadEmail } from '../services/leadUtils.js'
import mongoose from 'mongoose'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })
const resolveMx = promisify(dns.resolveMx)

// Validate email address
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

// Check if email is business domain
async function classifyEmail(email) {
  const domain = email.split('@')[1].toLowerCase()
  const personalDomains = [
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'aol.com',
    'protonmail.com',
    'icloud.com',
    'mail.com',
  ]

  if (personalDomains.includes(domain)) {
    return 'personal'
  }

  try {
    return 'business'
  } catch (e) {
    return 'unknown'
  }
}

// Upload Excel and auto-generate AI emails for a campaign
router.post('/:campaign_id/upload-and-generate', upload.single('file'), async (req, res) => {
  try {
    const { campaign_id } = req.params

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    const campaign = await Campaign.findById(campaign_id)
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' })
    }

    // Parse file with smart header and column detection
    const workbook = read(req.file.buffer)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const { data, headers, detected: detectedMap } = parseExcelSheetData(worksheet)

    if (!data.length) {
      return res.status(400).json({ error: 'No data found in the uploaded file' })
    }

    const srNoCol = headers.find(h => {
      const hLower = h.toLowerCase().trim()
      return ['sr. no.', 'sr no', 'sr_no', 's.no', 's no', 'serial no', 'serial number', '#'].some(v => hLower === v.toLowerCase())
    })

    // Extract rows with automatic lead email generation
    const rows = data.map((row, idx) => {
      const rawCustomData = {}
      headers.forEach(h => {
        if (row[h] !== undefined && row[h] !== null) {
          rawCustomData[h] = row[h].toString().trim()
        }
      })

      const email = ensureLeadEmail(row, idx, detectedMap)

      return {
        sr_no: srNoCol ? row[srNoCol] : (idx + 1),
        first_name: detectedMap.firstName ? (row[detectedMap.firstName] || '').toString().trim() : (row.f_name || row.first_name || '').toString().trim(),
        last_name: detectedMap.lastName ? (row[detectedMap.lastName] || '').toString().trim() : (row.l_name || row.last_name || '').toString().trim(),
        company: detectedMap.company ? (row[detectedMap.company] || '').toString().trim() : (row.company_name || row.company || '').toString().trim(),
        website: detectedMap.website ? (row[detectedMap.website] || '').toString().trim() : (row.website || '').toString().trim(),
        title: detectedMap.title ? (row[detectedMap.title] || '').toString().trim() : '',
        notes: detectedMap.notes ? (row[detectedMap.notes] || '').toString().trim() : '',
        linkedin_url: detectedMap.linkedinUrl ? (row[detectedMap.linkedinUrl] || '').toString().trim() : '',
        linkedin_data: detectedMap.linkedinData ? (row[detectedMap.linkedinData] || '').toString().trim() : '',
        email: email,
        raw_row: rawCustomData
      }
    }).filter(r => r.email)

    if (!rows.length) {
      return res.status(400).json({ error: 'No valid email addresses found in the file' })
    }

    // Check for duplicates
    const existingEmails = await Lead.find({ campaign_id }).lean()
    const existingEmailSet = new Set(existingEmails.map(l => l.email.toLowerCase()))

    const newRows = rows.filter(r => !existingEmailSet.has(r.email))
    const duplicateCount = rows.length - newRows.length

    if (!newRows.length) {
      return res.status(400).json({ error: 'All emails in this file already exist in the campaign' })
    }

    // Infer names from email
    function inferNameFromEmail(email) {
      const local = email.split('@')[0]
      const parts = local.split(/[._-]/)
      if (parts.length >= 2) {
        return {
          first_name: parts[0].charAt(0).toUpperCase() + parts[0].slice(1),
          last_name: parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '),
        }
      }
      return { first_name: local.charAt(0).toUpperCase() + local.slice(1), last_name: '' }
    }

    // Process each row: summarize LinkedIn + generate email
    const results = []
    const errors = []
    let imported = 0
    let draftsCreated = 0

    for (let rowIdx = 0; rowIdx < newRows.length; rowIdx++) {
      const row = newRows[rowIdx]
      if (rowIdx > 0) await sleep(2000) // rate-limit protection
      try {
        let firstName = row.first_name
        let lastName = row.last_name
        if (!firstName && !lastName) {
          const inferred = inferNameFromEmail(row.email)
          firstName = inferred.first_name
          lastName = inferred.last_name
        }

        // Summarize LinkedIn
        let linkedinSummary = null
        if (row.linkedin_url || row.linkedin_data) {
          linkedinSummary = await summarizeLinkedIn(row.linkedin_url || '', `${firstName} ${lastName}`, row.linkedin_data || '')
          await sleep(2000) // rate-limit: gap between LinkedIn call and email call
        }

        const emailType = await classifyEmail(row.email)

        const enrichmentObj = { raw_row: row.raw_row || {} }
        if (linkedinSummary) enrichmentObj.linkedin_summary = linkedinSummary

        // Create lead
        const lead = new Lead({
          campaign_id,
          first_name: firstName,
          last_name: lastName,
          email: row.email,
          linkedin_url: row.linkedin_url,
          linkedin_data: row.linkedin_data || '',
          company: row.company || '',
          website: row.website || '',
          title: row.title || '',
          notes: row.notes || '',
          email_type: emailType,
          enrichment_data: JSON.stringify(enrichmentObj),
          status: 'new',
        })
        await lead.save()
        imported++

        // Generate personalized email
        try {
          const leadData = {
            first_name: firstName,
            last_name: lastName,
            email: row.email,
            linkedin_url: row.linkedin_url,
            company: row.company || '',
            website: row.website || '',
            title: row.title || '',
            notes: row.notes || '',
          }

          const email = await generatePersonalizedEmail(leadData, linkedinSummary || {}, campaign)

          const draft = new Draft({
            lead_id: lead._id,
            campaign_id,
            sequence: 1,
            subject: email.subject,
            body: email.body,
            status: 'draft',
          })
          await draft.save()
          draftsCreated++

          await Lead.findByIdAndUpdate(lead._id, { status: 'drafted' })

          results.push({
            email: row.email,
            success: true,
            linkedin_summary: linkedinSummary,
            subject: email.subject,
          })
        } catch (genErr) {
          results.push({
            email: row.email,
            success: false,
            error: genErr.message,
          })
          errors.push(`AI generation failed for ${row.email}: ${genErr.message}`)
        }
      } catch (err) {
        errors.push(`Failed to process ${row.email}: ${err.message}`)
      }
    }

    res.json({
      success: true,
      total_rows: rows.length,
      imported,
      duplicates: duplicateCount,
      drafts_created: draftsCreated,
      results: results.slice(0, 50),
      errors: errors.slice(0, 10),
    })
  } catch (error) {
    console.error('Upload and generate error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Import leads from file
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    const { campaign_id } = req.body

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    if (!campaign_id) {
      return res.status(400).json({ error: 'Campaign ID required' })
    }

    // Parse file
    const workbook = read(req.file.buffer)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const { data, headers, detected: detectedMap } = parseExcelSheetData(worksheet)

    if (!data.length) {
      return res.status(400).json({ error: 'No data found in the uploaded file' })
    }

    if (!detectedMap.subject) {
      const subjectFound = headers.find(h => h.toLowerCase().includes('subject'))
      if (subjectFound) detectedMap.subject = subjectFound
    }
    if (!detectedMap.message) {
      const messageFound = headers.find(h => h.toLowerCase().includes('message') || h.toLowerCase().includes('body'))
      if (messageFound) detectedMap.message = messageFound
    }
    if (!detectedMap.image) {
      const imageFound = headers.find(h => h.toLowerCase().includes('image') || h.toLowerCase().includes('photo'))
      if (imageFound) detectedMap.image = imageFound
    }

    // Import leads
    let imported = 0
    let valid = 0
    let business = 0
    let personal = 0
    let invalid = 0
    let duplicates = 0
    const duplicateEmails = []
    const invalidEmails = []
    const errors = []

    for (let idx = 0; idx < data.length; idx++) {
      const row = data[idx]
       try {
         const firstName = detectedMap.firstName ? (row[detectedMap.firstName] || '') : (row.f_name || row.first_name || '')
         const lastName = detectedMap.lastName ? (row[detectedMap.lastName] || '') : (row.l_name || row.last_name || '')
         const email = ensureLeadEmail(row, idx, detectedMap)
         const company = detectedMap.company ? (row[detectedMap.company] || '') : (row.company_name || row.company || '')
         const website = detectedMap.website ? (row[detectedMap.website] || '') : (row.website || '')
         const title = row[detectedMap.title] || ''
         const notes = row[detectedMap.notes] || ''
         const subject = row[detectedMap.subject] || ''
         const message = row[detectedMap.message] || ''
         const image = row[detectedMap.image] || ''
         const linkedinUrl = row[detectedMap.linkedinUrl] || ''
         const linkedinData = row[detectedMap.linkedinData] || ''

        let invalidReason = null
        if (!email) {
          invalidReason = 'Missing email'
        } else if (!validateEmail(email)) {
          invalidReason = `Invalid email: ${email}`
        }

        if (invalidReason) {
          invalid++
          invalidEmails.push(invalidReason)
          continue
        }

        // Check for duplicates
        const existing = await Lead.findOne({ campaign_id, email })

        if (existing) {
          duplicates++
          duplicateEmails.push(email)
          continue
        }

        const emailType = await classifyEmail(email)

        const lead = new Lead({
           campaign_id,
           first_name: firstName,
           last_name: lastName,
           email,
           company,
           website,
           title,
           notes,
           linkedin_url: linkedinUrl,
           linkedin_data: linkedinData,
           email_type: emailType,
           status: 'new',
           subject,
           message,
           image_url: image
         })
        await lead.save()

        imported++
        valid++

        if (emailType === 'business') {
          business++
        } else if (emailType === 'personal') {
          personal++
        }
      } catch (err) {
        errors.push(`Row error: ${err.message}`)
        invalid++
      }
    }

    // Log import
    const importLog = new ImportLog({
      campaign_id,
      file_name: req.file.originalname,
      total_rows: data.length,
      valid_count: valid,
      business_count: business,
      personal_count: personal,
      invalid_count: invalid,
      errors: errors.length ? JSON.stringify(errors) : null,
    })
    await importLog.save()

    res.json({
      imported,
      valid,
      invalid,
      business,
      personal,
      duplicates,
      duplicateEmails: duplicateEmails.slice(0, 10),
      invalidEmails: invalidEmails.slice(0, 10),
      errors: errors.slice(0, 5),
    })
  } catch (error) {
    console.error('Import error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Import duplicates with override option
router.post('/import-duplicates', upload.single('file'), async (req, res) => {
  try {
    const { campaign_id } = req.body
    const force_import = req.body.force_import === 'true'

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    if (!campaign_id) {
      return res.status(400).json({ error: 'Campaign ID required' })
    }

    const workbook = read(req.file.buffer)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const { data, headers, detected: detectedMap } = parseExcelSheetData(worksheet)

    if (!data.length) {
      return res.status(400).json({ error: 'No data found in the uploaded file' })
    }

    let imported = 0
    let skipped = 0
    const errors = []

    for (let idx = 0; idx < data.length; idx++) {
      const row = data[idx]
      try {
        const email = ensureLeadEmail(row, idx, detectedMap)
        if (!email) {
          continue
        }

        if (!force_import) {
          const existing = await Lead.findOne({ campaign_id, email })
          if (existing) {
            skipped++
            continue
          }
        } else {
          // Delete existing and re-import
          await Lead.deleteMany({ campaign_id, email })
        }

        const emailType = await classifyEmail(email)

        const lead = new Lead({
          campaign_id,
          first_name: row[detectedMap.firstName] || '',
          last_name: row[detectedMap.lastName] || '',
          email,
          company: row[detectedMap.company] || '',
          website: row[detectedMap.website] || '',
          title: row[detectedMap.title] || '',
          notes: row[detectedMap.notes] || '',
          linkedin_url: row[detectedMap.linkedinUrl] || '',
          linkedin_data: detectedMap.linkedinData ? (row[detectedMap.linkedinData] || '').toString().trim() : '',
          email_type: emailType,
          status: 'new',
          subject: row[detectedMap.subject] || '',
          message: row[detectedMap.message] || '',
          image_url: row[detectedMap.image] || ''
        })
        await lead.save()
        imported++
      } catch (err) {
        errors.push(err.message)
      }
    }

    res.json({ imported, skipped, errors: errors.slice(0, 5) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get leads for campaign
router.get('/', async (req, res) => {
  try {
    const { campaign_id, status, limit } = req.query

    const filter = {}
    if (campaign_id) {
      if (mongoose.Types.ObjectId.isValid(campaign_id)) {
        filter.campaign_id = new mongoose.Types.ObjectId(campaign_id)
      } else {
        return res.status(400).json({ error: 'Invalid campaign ID format' })
      }
    }
    if (status) filter.status = status

    const maxLeads = parseInt(limit) || 500
    const leads = await Lead.find(filter).sort({ created_at: -1 }).limit(maxLeads).lean()
    
    // Map _id to id for frontend compatibility
    const result = leads.map(l => ({ ...l, id: l._id }))

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get lead by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const lead = await Lead.findById(id).lean()

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' })
    }

    if (lead.enrichment_data) {
      try {
        lead.enrichment_data = JSON.parse(lead.enrichment_data)
      } catch (e) {
        // Already an object or malformed
      }
    }
    lead.id = lead._id

    res.json(lead)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Generate drafts for campaign leads
router.post('/:campaign_id/generate-drafts', async (req, res) => {
  try {
    const { campaign_id } = req.params

    const campaign = await Campaign.findById(campaign_id).lean()
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' })
    }

    // Find leads that are either new, or drafted (but NOT sent/replied/etc.)
    const leads = await Lead.find({ campaign_id, status: { $in: ['new', 'drafted'] } }).lean()

    if (!leads.length) {
      const totalCampaignLeads = await Lead.countDocuments({ campaign_id })
      if (totalCampaignLeads > 0) {
         return res.status(400).json({ error: 'All leads in this campaign have already been sent emails or processed.' })
      }
      return res.status(400).json({ error: 'No leads found in this campaign. Please import leads first.' })
    }

    // Delete existing unapproved drafts for these leads so we can overwrite them
    const leadIds = leads.map(l => l._id)
    await Draft.deleteMany({ lead_id: { $in: leadIds }, status: 'draft' })

    // Parse campaign config
    const followup_days = JSON.parse(campaign.followup_days || '[]')
    const followup_prompts = JSON.parse(campaign.followup_prompts || '{}')

    // Enrich leads (if needed)
    const enrichmentMap = await enrichLeadBatch(leads)

    // Store merged enrichment data + fetch LinkedIn summary if linkedin_url is present
    const mergedEnrichmentMap = {}
    for (const lead of leads) {
      const leadId = lead._id.toString()
      let existingEnrichment = {}
      if (lead.enrichment_data) {
        try {
          existingEnrichment = JSON.parse(lead.enrichment_data) || {}
        } catch (e) {}
      }

      const webEnrichment = enrichmentMap[leadId] || {}
      
      const mergedEnrichment = {
        ...existingEnrichment,
        ...webEnrichment,
        services: webEnrichment.services || existingEnrichment.services || [],
        issues: webEnrichment.issues || existingEnrichment.issues || [],
      }

      // Check if we need to summarize LinkedIn
      const linkedinUrl = lead.linkedin_url || mergedEnrichment.linkedin_url || ''
      const linkedinData = lead.linkedin_data || ''
      let linkedinSummary = mergedEnrichment.linkedin_summary || null

      if ((linkedinUrl || linkedinData) && !linkedinSummary) {
        try {
          console.log(`Summarizing LinkedIn profile for ${lead.first_name} ${lead.last_name}`)
          await sleep(2000) // Rate limit protection
          linkedinSummary = await summarizeLinkedIn(linkedinUrl, `${lead.first_name || ''} ${lead.last_name || ''}`, linkedinData)
          mergedEnrichment.linkedin_summary = linkedinSummary
        } catch (e) {
          console.error(`Failed to summarize LinkedIn for lead ${lead.email}:`, e.message)
        }
      }

      // If we found a LinkedIn URL during crawling but not in lead, update the database fields
      const updateFields = { enrichment_data: JSON.stringify(mergedEnrichment) }
      if (mergedEnrichment.linkedin_url && !lead.linkedin_url) {
        updateFields.linkedin_url = mergedEnrichment.linkedin_url
        lead.linkedin_url = mergedEnrichment.linkedin_url
      }
      
      await Lead.findByIdAndUpdate(leadId, updateFields)
      mergedEnrichmentMap[leadId] = mergedEnrichment
    }

    // Generate emails
    const emailResults = await generateEmailBatch(leads, mergedEnrichmentMap, { ...campaign, followup_days, followup_prompts })

    // Create drafts
    let created = 0
    let lastError = null
    for (const lead of leads) {
      const emailResult = emailResults.find(r => r.leadId === lead._id.toString())
      const subject = lead.subject || emailResult?.subject || ''
      const body = lead.message || emailResult?.body || ''
      
      if (subject || body) {
        const draft = new Draft({
          lead_id: lead._id,
          campaign_id,
          sequence: 1,
          subject,
          body,
          status: 'draft'
        })
        await draft.save()
        created++
        await Lead.findByIdAndUpdate(lead._id, { status: 'drafted' })
      } else if (emailResult && !emailResult.success) {
        console.error(`Failed to generate email for lead ${lead.email}:`, emailResult.error)
        lastError = emailResult.error
      }
    }

    if (created === 0 && lastError) {
       return res.status(500).json({ error: `AI Generation Failed: ${lastError}` })
    }

    res.json({ success: true, generated: created, total: leads.length })
  } catch (error) {
    console.error('Draft generation error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Generate drafts without AI
router.post('/:campaign_id/generate-drafts-no-ai', async (req, res) => {
  try {
    const { campaign_id } = req.params

    const campaign = await Campaign.findById(campaign_id).lean()
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' })
    }

    const leads = await Lead.find({ 
      campaign_id, 
      status: { $in: ['new', 'drafted'] },
      subject: { $ne: null, $ne: '' },
      message: { $ne: null, $ne: '' }
    }).lean()

    if (!leads.length) {
      return res.json({ 
        success: true, 
        generated: 0,
        message: 'No eligible leads found. They may have already been processed.'
      })
    }

    // Delete existing unapproved drafts for these leads so we can overwrite them
    const leadIds = leads.map(l => l._id)
    await Draft.deleteMany({ lead_id: { $in: leadIds }, status: 'draft' })

    let created = 0
    for (const lead of leads) {
      const draft = new Draft({
        lead_id: lead._id,
        campaign_id,
        sequence: 1,
        subject: lead.subject,
        body: lead.message,
        status: 'draft'
      })
      await draft.save()
      created++
      await Lead.findByIdAndUpdate(lead._id, { status: 'drafted' })
    }

    res.json({ 
      success: true, 
      generated: created, 
      total: leads.length,
      message: `Created ${created} draft emails from Excel data`
    })
  } catch (error) {
    console.error('Draft generation error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update lead
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updateData = { ...req.body, updated_at: new Date() }
    
    await Lead.findByIdAndUpdate(id, updateData)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete lead
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    await Draft.deleteMany({ lead_id: id })
    await Event.deleteMany({ lead_id: id })
    await Followup.deleteMany({ lead_id: id })
    await Lead.findByIdAndDelete(id)

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
