import { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { Clock, Send, XCircle, AlertCircle, Mail, RotateCcw, CheckCircle, Calendar, Edit2, Sparkles, Search, Filter, X } from 'lucide-react'

const SEQUENCE_LABELS = {
  1: { label: 'Main Email', icon: 'send' },
  2: { label: 'Follow-up 1', icon: 'follow' },
  3: { label: 'Follow-up 2', icon: 'follow' },
  4: { label: 'Follow-up 3', icon: 'follow' },
  5: { label: 'Close-up', icon: 'close' },
}

const STATUS_BADGES = {
  pending: { label: 'Scheduled', color: 'bg-amber-500/20 text-amber-400' },
  sent: { label: 'Sent', color: 'bg-green-500/20 text-green-400' },
  failed: { label: 'Failed', color: 'bg-red-500/20 text-red-400' },
  cancelled: { label: 'Cancelled', color: 'bg-slate-500/20 text-slate-400' },
  approved: { label: 'Approved', color: 'bg-blue-500/20 text-blue-400' },
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  })
}

export default function Followups() {
  const [leads, setLeads] = useState([])
  const [followups, setFollowups] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedLead, setExpandedLead] = useState(null)
  const [editingFollowup, setEditingFollowup] = useState(null)
  const [editSubject, setEditSubject] = useState('')
  const [editContent, setEditContent] = useState('')
  const [generatingAI, setGeneratingAI] = useState(null) // Stores the ID of followup being generated

  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sequenceFilter, setSequenceFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const hasActiveFilters = searchQuery || statusFilter || sequenceFilter || dateFrom || dateTo

  const merged = useMemo(() => {
    const byLead = {}
    followups.forEach(f => {
      const leadId = f.lead_id?._id || f.lead_id
      if (!byLead[leadId]) byLead[leadId] = []
      byLead[leadId].push(f)
    })
    return leads.map(lead => {
      const leadFollowups = (byLead[lead.id] || []).sort((a, b) => a.sequence - b.sequence)
      return { lead, followups: leadFollowups }
    })
  }, [leads, followups])

  const displayData = useMemo(() => {
    if (!hasActiveFilters) return merged

    return merged
      .map(({ lead, followups: fups }) => {
        let filtered = fups

        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          const matchesLead = (lead.first_name + ' ' + lead.last_name + ' ' + lead.email + ' ' + (lead.company || '')).toLowerCase().includes(q)
          filtered = filtered.filter(fu => {
            const dateStr = formatDateTime(fu.scheduled_date || fu.sent_at || fu.created_at || fu.createdAt)
            return matchesLead
              || (fu.subject || '').toLowerCase().includes(q)
              || dateStr.toLowerCase().includes(q)
          })
        }

        if (statusFilter) {
          filtered = filtered.filter(fu => fu.status === statusFilter)
        }

        if (sequenceFilter) {
          filtered = filtered.filter(fu => fu.sequence === Number(sequenceFilter))
        }

        if (dateFrom || dateTo) {
          filtered = filtered.filter(fu => {
            const d = new Date(fu.scheduled_date || fu.sent_at || fu.created_at)
            if (dateFrom && d < new Date(dateFrom)) return false
            if (dateTo) {
              const end = new Date(dateTo)
              end.setHours(23, 59, 59, 999)
              if (d > end) return false
            }
            return true
          })
        }

        return { lead, followups: filtered }
      })
      .filter(({ followups }) => followups.length > 0)
  }, [merged, searchQuery, statusFilter, sequenceFilter, dateFrom, dateTo, hasActiveFilters])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchData() {
    try {
      const [leadsRes, followupsRes] = await Promise.all([
        axios.get('/api/leads', { params: { limit: 500 } }),
        axios.get('/api/followups', { params: { limit: 2000 } }),
      ])
      setLeads(leadsRes.data)
      setFollowups(followupsRes.data)
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function cancelFollowup(followupId) {
    if (!confirm('Cancel this follow-up?')) return
    try {
      await axios.post(`/api/followups/${followupId}/reject`)
      fetchData()
    } catch (err) {
      console.error('Failed to cancel follow-up:', err)
    }
  }

  const handleEditFollowup = async (followupId) => {
    try {
      const res = await axios.get(`/api/followups/${followupId}`)
      const followup = res.data
      setEditingFollowup(followup)
      setEditSubject(followup.subject || '')
      setEditContent(followup.body || '')  // FIXED: Changed from 'content' to 'body'
    } catch (err) {
      console.error('Failed to fetch follow-up for editing:', err)
      setEditingFollowup(null)
    }
  }

  const handleSaveEdit = async (followupId) => {
    try {
      await axios.put(`/api/followups/${followupId}`, {
        subject: editSubject,
        body: editContent,
      })
      setEditingFollowup(null)
      setEditSubject('')
      setEditContent('')
      fetchData()
    } catch (err) {
      console.error('Failed to update follow-up:', err)
    }
  }

  const handleCancelEdit = () => {
    setEditingFollowup(null)
    setEditSubject('')
    setEditContent('')
  }

    const generateAIFollowup = async (followupId) => {
    setGeneratingAI(followupId)
    try {
      const res = await axios.post(`/api/followups/${followupId}/generate`)
      // Update the followup in the list with AI-generated content
      setFollowups(prev =>
        prev.map(f =>
          f._id === followupId
            ? {...f, subject: res.data.subject, body: res.data.body}
            : f
        )
      )

      // If we were editing this followup, update the edit form too
      if (editingFollowup && editingFollowup._id === followupId) {
        setEditSubject(res.data.subject || '')
        setEditContent(res.data.body || '')
      }
    } catch (err) {
      console.error('Failed to generate AI followup:', err)
      alert('Failed to generate AI content')
    } finally {
      setGeneratingAI(null)
    }
  }

  if (loading) {
    return <div className="p-8 text-slate-300">Loading follow-up data...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-100">Follow-ups</h1>
          <p className="text-slate-400 mt-2">Scheduled and sent follow-ups timeline across all campaigns</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-slate-400 text-sm">Total Leads</p>
          <p className="text-2xl font-bold text-slate-100">{leads.length}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Pending Follow-ups</p>
          <p className="text-2xl font-bold text-amber-400">{followups.filter(f => f.status === 'pending').length}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Sent Follow-ups</p>
          <p className="text-2xl font-bold text-green-400">{followups.filter(f => f.status === 'sent').length}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Cancelled</p>
          <p className="text-2xl font-bold text-slate-400">{followups.filter(f => f.status === 'cancelled').length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, email or subject..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-800 dark:text-slate-100 text-sm placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Status:</span>
            {['', 'pending', 'sent', 'cancelled', 'failed'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all duration-200 ${
                  statusFilter === s
                    ? s === '' ? 'bg-indigo-100 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-300'
                        : s === 'pending' ? 'bg-amber-100 dark:bg-amber-500/20 border-amber-300 dark:border-amber-500/50 text-amber-700 dark:text-amber-300'
                        : s === 'sent' ? 'bg-green-100 dark:bg-green-500/20 border-green-300 dark:border-green-500/50 text-green-700 dark:text-green-300'
                        : s === 'cancelled' ? 'bg-slate-200 dark:bg-slate-500/30 border-slate-400 dark:border-slate-500/50 text-slate-700 dark:text-slate-300'
                        : 'bg-red-100 dark:bg-red-500/20 border-red-300 dark:border-red-500/50 text-red-700 dark:text-red-300'
                    : 'bg-transparent border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Sequence */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Sequence:</span>
            {['', '1', '2', '3', '4', '5'].map(s => (
              <button
                key={s}
                onClick={() => setSequenceFilter(sequenceFilter === s ? '' : s)}
                className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all duration-200 ${
                  sequenceFilter === s
                    ? 'bg-indigo-100 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-300'
                    : 'bg-transparent border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                {s === '' ? 'All' : SEQUENCE_LABELS[Number(s)]?.label || `Seq ${s}`}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Date:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
            />
            <span className="text-xs text-slate-400">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
            />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }} className="p-1 text-slate-400 hover:text-red-400 transition-colors">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Clear all */}
          {hasActiveFilters && (
            <button
              onClick={() => { setSearchQuery(''); setStatusFilter(''); setSequenceFilter(''); setDateFrom(''); setDateTo('') }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 transition-all duration-200 ml-auto"
            >
              <X size={12} />
              Clear filters
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Showing {displayData.reduce((sum, { followups }) => sum + followups.length, 0)} of {merged.reduce((sum, { followups }) => sum + followups.length, 0)} follow-ups
          </div>
        )}
      </div>

      {displayData.length > 0 ? (
        <div className="space-y-3">
          {displayData.map(({ lead, followups }) => {
            const hasFollowups = followups.length > 0
            const pendingFollowups = followups.filter(f => f.status === 'pending')
            const sentFollowups = followups.filter(f => f.status === 'sent')
            const isExpanded = expandedLead === lead.id
            const dateSource = followups.find(fu => Number(fu.sequence) === 1) || followups[0]
            const firstDate = dateSource ? formatDateTime(dateSource.sent_at || dateSource.scheduled_date || dateSource.created_at || dateSource.createdAt || dateSource.updated_at || dateSource.updatedAt) : null

            if (!hasFollowups) return null

            return (
              <div key={lead.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                  className="w-full flex items-center p-4 hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-[2] min-w-0">
                    <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center">
                      <span className="text-indigo-400 font-bold text-sm">
                        {(lead.first_name || lead.email)[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-slate-200 font-medium">
                        {lead.first_name || 'Unknown'} {lead.last_name || ''}
                      </p>
                      <p className="text-slate-400 text-xs">{lead.email}</p>
                    </div>
                    {lead.company && (
                      <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded">
                        {lead.company}
                      </span>
                    )}
                  </div>

                  {firstDate && (
                    <div className="flex-1 flex justify-center">
                      <span className="flex items-center gap-1.5 text-sm text-slate-400">
                        <Calendar size={14} className="text-indigo-400" />
                        <span className="tabular-nums font-medium">{firstDate}</span>
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 flex-1 justify-end">
                    {pendingFollowups.length > 0 && (
                      <span className="flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full">
                        <Clock size={12} />
                        {pendingFollowups.length} pending
                      </span>
                    )}
                    {sentFollowups.length > 0 && (
                      <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                        <CheckCircle size={12} />
                        {sentFollowups.length} sent
                      </span>
                    )}
                    {lead.status === 'replied' && (
                      <span className="flex items-center gap-1 text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
                        <Mail size={12} /> Replied
                      </span>
                    )}
                    <Clock size={14} className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-700">
                    {followups.map((fu, idx) => {
                      const seqInfo = SEQUENCE_LABELS[fu.sequence] || { label: `Sequence ${fu.sequence}`, icon: 'follow' }
                      const badge = STATUS_BADGES[fu.status] || { label: fu.status, color: 'bg-slate-500/20 text-slate-400' }
                      const isPast = fu.scheduled_date && new Date(fu.scheduled_date) < new Date() && fu.status === 'pending'

                      return (
                        <div key={fu._id} className={`flex items-center gap-4 px-4 py-3 ${idx < followups.length - 1 ? 'border-b border-slate-700/50' : ''} hover:bg-slate-700/20 transition-colors`}>
                          <div className="flex flex-col items-center gap-1">
                            <div className={`w-2.5 h-2.5 rounded-full ${
                              fu.status === 'sent' ? 'bg-green-500' :
                              fu.status === 'cancelled' ? 'bg-slate-600' :
                              fu.status === 'failed' ? 'bg-red-500' :
                              isPast ? 'bg-amber-500 animate-pulse' : 'bg-amber-500'
                            }`} />
                            {idx < followups.length - 1 && <div className="w-0.5 h-6 bg-slate-700" />}
                          </div>

                          <span className="text-xs font-medium text-slate-300 w-20">{seqInfo.label}</span>

                          <span className="text-xs text-slate-400 flex-1 truncate max-w-[200px]">
                            {fu.subject || '(No subject)'}
                          </span>

                          <span className="flex items-center gap-1 text-xs text-slate-400 w-44">
                            <Calendar size={11} />
                            {formatDateTime(fu.scheduled_date || fu.sent_at || fu.created_at)}
                          </span>

                          <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>
                            {badge.label}
                          </span>

                          <div className="ml-auto flex items-center gap-2">
                            {fu.status === 'pending' && (
                              <button
                                onClick={() => handleEditFollowup(fu._id)}
                                className="p-1 hover:bg-indigo-500/20 rounded text-indigo-400 hover:text-indigo-300"
                                title="Edit follow-up"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {fu.status === 'pending' && (
                              <button
                                onClick={() => cancelFollowup(fu._id)}
                                className="ml-2 p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300"
                                title="Cancel follow-up"
                              >
                                <XCircle size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card text-center py-12 text-slate-400">
          {hasActiveFilters ? 'No follow-ups match your filters' : 'No leads with follow-ups found'}
        </div>
      )}

      {editingFollowup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-[backdropFadeIn_0.2s_ease]"
            onClick={handleCancelEdit}
          ></div>
          <div className="relative w-full max-w-2xl mx-auto animate-[modalFadeIn_0.3s_cubic-bezier(0.16,1,0.3,1)] pointer-events-auto">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 shrink-0">
                    <Edit2 size={18} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Edit Follow-up</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                      {SEQUENCE_LABELS[editingFollowup.sequence]?.label || `Sequence ${editingFollowup.sequence}`} &middot; {editingFollowup.first_name || 'Unknown'} {editingFollowup.last_name || ''} ({editingFollowup.email || ''})
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCancelEdit}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all duration-200 shrink-0"
                >
                  <XCircle size={20} />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Subject Line</label>
                    <span className="text-xs text-slate-400 tabular-nums">{editSubject.length}/200</span>
                  </div>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value.slice(0, 200))}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/30 transition-all duration-200"
                    placeholder="Enter email subject"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Body</label>
                    <span className="text-xs text-slate-400 tabular-nums">{editContent.length}/5000</span>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value.slice(0, 5000))}
                    rows={10}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 font-mono text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/30 transition-all duration-200 resize-y min-h-[200px]"
                    placeholder="Write your email content here..."
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-700/50">
                <button
                  onClick={handleCancelEdit}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700/80 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600/50 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveEdit(editingFollowup._id)}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 dark:bg-indigo-500 rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-400 transition-all duration-200 shadow-lg shadow-indigo-500/25 dark:shadow-indigo-500/10"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}