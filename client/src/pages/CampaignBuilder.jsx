import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Tag, Clock, Mail } from 'lucide-react'

export default function CampaignBuilder() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)

  const [followupTemplates, setFollowupTemplates] = useState([
    {
      sequence: 1,
      delay_days: 3,
      enabled: true,
      subject: 'Re: [subject]',
      body: `Hi [f_name],\n\nI wanted to quickly follow up on my previous message to see if you had a chance to review it.\n\nI'd love to hear your thoughts on how we can help [company_name].\n\nBest regards`
    },
    {
      sequence: 2,
      delay_days: 6,
      enabled: true,
      subject: 'Quick check-in regarding [company_name]',
      body: `Hi [f_name],\n\nChecking in to see if this is on your radar.\n\nWe've helped similar companies streamline their outreach. Would you be open for a quick chat this week?\n\nBest regards`
    },
    {
      sequence: 3,
      delay_days: 9,
      enabled: true,
      subject: 'Idea for [company_name]',
      body: `Hi [f_name],\n\nI know you're busy! I just wanted to share one quick idea that could really benefit [company_name].\n\nIf you're interested, let me know when might be a good time to connect.\n\nThanks`
    },
    {
      sequence: 4,
      delay_days: 14,
      enabled: true,
      subject: 'Should I close your file?',
      body: `Hi [f_name],\n\nI haven't heard back, so I assume now might not be the right time for [company_name].\n\nIf things change in the future, feel free to reach out anytime. Wish you all the best!\n\nRegards`
    }
  ])

  const placeholders = [
    { label: 'First Name', tag: '[f_name]' },
    { label: 'Last Name', tag: '[L_name]' },
    { label: 'Company Name', tag: '[company_name]' },
    { label: 'Website', tag: '[website]' },
    { label: 'Email', tag: '[email]' },
  ]

  function insertTag(tag, field, followupIdx = null) {
    if (followupIdx !== null) {
      setFollowupTemplates(prev => {
        const updated = [...prev]
        if (field === 'subject') {
          updated[followupIdx].subject = updated[followupIdx].subject ? updated[followupIdx].subject + ' ' + tag : tag
        } else {
          updated[followupIdx].body = updated[followupIdx].body ? updated[followupIdx].body + ' ' + tag : tag
        }
        return updated
      })
      return
    }

    if (field === 'subject') {
      setSubject(prev => (prev ? prev + ' ' + tag : tag))
    } else {
      setBody(prev => (prev ? prev + ' ' + tag : tag))
    }
  }

  function updateFollowupField(idx, field, val) {
    setFollowupTemplates(prev => {
      const updated = [...prev]
      updated[idx][field] = val
      return updated
    })
  }

  async function handleCreate() {
    if (!name.trim()) {
      alert('Please enter a campaign name')
      return
    }
    if (!subject.trim() && !body.trim()) {
      alert('Please write an email subject or message')
      return
    }
    setLoading(true)
    try {
      const res = await axios.post('/api/campaigns', {
        name: name.trim(),
        subject_template: subject.trim(),
        body_template: body.trim(),
        master_prompt: body.trim(),
        followup_templates: followupTemplates,
      })
      navigate(`/campaigns/${res.data.id}`)
    } catch (err) {
      alert('Failed to create campaign: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Create Campaign</h1>
        <p className="text-slate-400 mt-1">Compose your main email & 4 automated follow-up emails. Placeholders like <span className="text-indigo-400 font-mono">[f_name]</span> and <span className="text-indigo-400 font-mono">[company_name]</span> will automatically be replaced with lead data.</p>
      </div>

      <div className="card space-y-6">
        <h2 className="text-lg font-bold text-slate-100 border-b border-slate-700 pb-2 flex items-center gap-2">
          <Mail size={18} className="text-indigo-400" /> Step 1: Main Email Template
        </h2>

        <div>
          <label className="block text-slate-300 text-sm font-medium mb-2">Campaign Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Web Design Outreach Campaign"
            className="input"
          />
        </div>

        {/* Excel Column Placeholders quick buttons */}
        <div>
          <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Tag size={14} className="text-indigo-400" /> Click to Insert Placeholders into Main Email
          </label>
          <div className="flex flex-wrap gap-2">
            {placeholders.map(p => (
              <button
                key={p.tag}
                type="button"
                onClick={() => insertTag(p.tag, 'body')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-lg text-xs font-mono transition-colors flex items-center gap-1"
                title={`Click to insert ${p.tag} into body`}
              >
                <span>+</span> <span>{p.tag}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-slate-300 text-sm font-medium">Email Subject</label>
            <div className="flex gap-1.5">
              {placeholders.slice(0, 3).map(p => (
                <button
                  key={`subj-${p.tag}`}
                  type="button"
                  onClick={() => insertTag(p.tag, 'subject')}
                  className="text-xs font-mono text-indigo-400 hover:text-indigo-300 underline"
                >
                  +{p.tag}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="e.g., Quick question for [f_name] regarding [company_name]"
            className="input font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-slate-300 text-sm font-medium mb-2">Email Body / Message</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={`Hi [f_name],

I noticed your website at [website] and wanted to reach out to [company_name].

We help businesses like yours scale outreach and win client deals. Would you be open for a quick chat next week?

Best regards`}
            className="input min-h-48 font-mono text-sm leading-relaxed"
          />
        </div>
      </div>

      {/* 4 Custom Manual Follow-up Templates */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Clock size={20} className="text-indigo-400" /> Step 2: Custom Follow-up Emails (4 Rounds)
        </h2>
        <p className="text-slate-400 text-sm">Configure up to 4 custom manual follow-up emails. Each follow-up will be sent automatically after your specified delay in days.</p>

        {followupTemplates.map((fu, idx) => (
          <div key={fu.sequence} className="card space-y-4 border border-slate-700 bg-slate-900/60">
            <div className="flex justify-between items-center border-b border-slate-700/60 pb-3">
              <div className="flex items-center gap-3">
                <span className="bg-indigo-600/30 text-indigo-300 font-bold px-3 py-1 rounded text-sm">
                  Follow-up #{fu.sequence}
                </span>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-sm">
                  <input
                    type="checkbox"
                    checked={fu.enabled}
                    onChange={e => updateFollowupField(idx, 'enabled', e.target.checked)}
                    className="checkbox"
                  />
                  Enable Follow-up {fu.sequence}
                </label>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 font-medium">Delay (Days):</label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={fu.delay_days}
                  onChange={e => updateFollowupField(idx, 'delay_days', parseInt(e.target.value) || 1)}
                  disabled={!fu.enabled}
                  className="input w-20 text-center text-sm font-bold py-1 bg-slate-800"
                />
              </div>
            </div>

            {fu.enabled && (
              <div className="space-y-4 pt-1">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Follow-up {fu.sequence} Subject</label>
                    <div className="flex gap-1.5">
                      {placeholders.slice(0, 3).map(p => (
                        <button
                          key={`fu-${idx}-subj-${p.tag}`}
                          type="button"
                          onClick={() => insertTag(p.tag, 'subject', idx)}
                          className="text-xs font-mono text-indigo-400 hover:text-indigo-300 underline"
                        >
                          +{p.tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={fu.subject}
                    onChange={e => updateFollowupField(idx, 'subject', e.target.value)}
                    placeholder="e.g. Re: [subject]"
                    className="input font-mono text-sm"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Follow-up {fu.sequence} Body / Message</label>
                    <div className="flex gap-1.5">
                      {placeholders.map(p => (
                        <button
                          key={`fu-${idx}-body-${p.tag}`}
                          type="button"
                          onClick={() => insertTag(p.tag, 'body', idx)}
                          className="text-xs font-mono text-indigo-400 hover:text-indigo-300 underline"
                        >
                          +{p.tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={fu.body}
                    onChange={e => updateFollowupField(idx, 'body', e.target.value)}
                    rows={4}
                    placeholder="Write custom follow-up message..."
                    className="input font-mono text-sm leading-relaxed"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/campaigns')}
            className="btn btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="btn btn-primary flex-1"
          >
            {loading ? 'Creating...' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </div>
  )
}

