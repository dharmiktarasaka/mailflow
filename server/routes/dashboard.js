import express from 'express'
import { Campaign, Lead, Followup, LeadEvent as Event, Draft } from '../db/models.js'

const router = express.Router()

// Root route - redirect to overview
router.get('/', (req, res) => {
  res.redirect('/api/dashboard/overview')
})

// Get overall stats
router.get('/stats', async (req, res) => {
  try {
    const total_leads = await Lead.countDocuments()
    const sent_leads = await Lead.countDocuments({ status: 'sent' })
    const replied_leads = await Lead.countDocuments({ status: 'replied' })
    const bounced_leads = await Lead.countDocuments({ status: 'bounced' })
    const followups_pending = await Followup.countDocuments({ status: 'pending' })
    const total_campaigns = await Campaign.countDocuments()

    // Calculate reply rate — denominator must include replied leads (they were also sent)
    const totalSentOrReplied = sent_leads + replied_leads
    const replyRate =
      totalSentOrReplied > 0 ? ((replied_leads / totalSentOrReplied) * 100).toFixed(1) : 0

    res.json({
      total_leads,
      sent_leads,
      replied_leads,
      bounced_leads,
      followups_pending,
      total_campaigns,
      reply_rate: replyRate,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get stats for this week
router.get('/stats/week', async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const sent_this_week = await Event.countDocuments({
      event_type: 'sent',
      created_at: { $gte: oneWeekAgo }
    })
    
    const replied_this_week = await Event.countDocuments({
      event_type: 'replied',
      created_at: { $gte: oneWeekAgo }
    })

    res.json({
      sent_this_week,
      replied_this_week
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get dashboard data
router.get('/overview', async (req, res) => {
  try {
    // Overall stats
    const total_leads = await Lead.countDocuments()
    const sent_count = await Lead.countDocuments({ status: 'sent' })
    const replied_count = await Lead.countDocuments({ status: 'replied' })
    const bounced_count = await Lead.countDocuments({ status: 'bounced' })
    
const todayStart = new Date()
todayStart.setHours(0, 0, 0, 0)
const todayEnd = new Date()
todayEnd.setHours(23, 59, 59, 999)
const followups_due_today = await Followup.countDocuments({
  status: 'pending',
  scheduled_date: {
    $gte: todayStart,
    $lte: todayEnd
  }
})

    const overall = {
      total_leads,
      sent_count,
      replied_count,
      bounced_count,
      followups_due_today
    }

    // Active campaigns
    const campaigns = await Campaign.find({ status: { $ne: 'complete' } })
      .sort({ created_at: -1 })
      .limit(10)
      .lean()

    const activeCampaigns = await Promise.all(campaigns.map(async (c) => {
      const lead_count = await Lead.countDocuments({ campaign_id: c._id })
      const sent_count = await Lead.countDocuments({ campaign_id: c._id, status: 'sent' })
      const reply_count = await Lead.countDocuments({ campaign_id: c._id, status: 'replied' })
      return {
        ...c,
        id: c._id,
        lead_count,
        sent_count,
        reply_count
      }
    }))

    // Recent events
    const events = await Event.find()
      .populate('lead_id')
      .sort({ created_at: -1 })
      .limit(20)
      .lean()

    const recentEvents = events.map(e => ({
      ...e,
      id: e._id,
      email: e.lead_id?.email,
      first_name: e.lead_id?.first_name,
      company: e.lead_id?.company,
      metadata: e.metadata ? JSON.parse(e.metadata) : null
    }))

    // Leads by status (for kanban)
    const statuses = await Lead.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ])
    
    const leadsByStatus = {}
    statuses.forEach(s => {
      leadsByStatus[s._id] = s.count
    })

    res.json({
      overall,
      activeCampaigns,
      recentEvents,
      leadsByStatus,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get open tracking stats
router.get('/tracking', async (req, res) => {
  try {
    const total_opens = await Event.countDocuments({ event_type: 'opened' })
    
    // Unique opens (by draft_id)
    const unique_opens_res = await Event.aggregate([
      { $match: { event_type: 'opened' } },
      { $group: { _id: "$draft_id" } },
      { $count: "count" }
    ])

    const unique_opens = unique_opens_res.length > 0 ? unique_opens_res[0].count : 0

    res.json({
      total_opens,
      unique_opens
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router ;