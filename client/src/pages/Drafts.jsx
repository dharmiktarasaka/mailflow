import { useEffect, useState } from 'react'
import axios from 'axios'
import { CheckCircle, XCircle, Edit2, Calendar, Loader2, Trash2, Clock, Send, Zap, AlertCircle } from 'lucide-react'

const DELAY_OPTIONS = [
  { value: 5, label: '5 seconds' },
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
]

export default function Drafts() {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('draft')
  const [editingDraft, setEditingDraft] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [scheduleDraft, setScheduleDraft] = useState(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendDelay, setSendDelay] = useState(60)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState(null)
  const [sendError, setSendError] = useState(null)
  const [singleSendDraft, setSingleSendDraft] = useState(null)

  useEffect(() => {
    fetchDrafts()
    
    // Auto-refresh every 15 seconds to reflect incoming replies instantly
    const interval = setInterval(() => {
      axios.get('/api/drafts', { params: { status: filter } })
        .then(res => setDrafts(res.data))
        .catch(err => console.error(err))
    }, 15000)
    
    return () => clearInterval(interval)
  }, [filter])

  async function fetchDrafts() {
    try {
      const res = await axios.get('/api/drafts', { params: { status: filter } })
      setDrafts(res.data)
    } catch (err) {
      console.error('Failed to fetch drafts:', err)
    } finally {
      setLoading(false)
    }
  }

  async function approveDraft(id) {
    try {
      await axios.post(`/api/drafts/${id}/approve`)
      fetchDrafts()
    } catch (err) {
      alert('Failed to approve draft')
    }
  }

  async function approveAndSendDraft(id) {
    try {
      await axios.post(`/api/drafts/${id}/approve`)
      await axios.post(`/api/send/single`, { draft_id: id })
      fetchDrafts()
      alert('Email approved and sent successfully!')
    } catch (err) {
      alert('Failed to send: ' + (err.response?.data?.error || err.message))
    }
  }

  async function rejectDraft(id) {
    try {
      await axios.post(`/api/drafts/${id}/reject`)
      fetchDrafts()
    } catch (err) {
      alert('Failed to reject draft')
    }
  }

  async function saveEdit() {
    if (!editingDraft) return
    setSavingEdit(true)
    try {
      await axios.put(`/api/drafts/${editingDraft.id}`, {
        subject: editingDraft.subject,
        body: editingDraft.body,
        email: editingDraft.email,
      })
      setEditingDraft(null)
      fetchDrafts()
    } catch (err) {
      alert('Failed to save')
    } finally {
      setSavingEdit(false)
    }
  }

  async function saveSchedule() {
    if (!scheduleDraft || !scheduleDate || !scheduleTime) return
    setScheduling(true)
    try {
      const scheduledDateTime = `${scheduleDate}T${scheduleTime}:00`
      await axios.put(`/api/drafts/${scheduleDraft.id}`, {
        scheduled_at: scheduledDateTime,
        status: 'scheduled',
      })
      setScheduleDraft(null)
      setScheduleDate('')
      setScheduleTime('')
      fetchDrafts()
      alert('Email scheduled successfully!')
    } catch (err) {
      alert('Failed to schedule')
    } finally {
      setScheduling(false)
    }
  }

  async function deleteDraft(draft) {
    const isActuallyDraft = draft.status === 'draft'
    const message = isActuallyDraft
      ? 'Delete this draft permanently?'
      : 'Move this email back to the draft section?'
    if (!confirm(message)) return
    try {
      await axios.delete(`/api/drafts/${draft.id}`)
      fetchDrafts()
    } catch (err) {
      alert('Failed to process request')
    }
  }

  async function startSending() {
    setSending(true)
    setSendError(null)
    
    try {
      if (singleSendDraft) {
        await axios.post('/api/send/single', { draft_id: singleSendDraft.id })
        setSending(false)
        alert('Email sent successfully!')
        setSingleSendDraft(null)
        setShowSendModal(false)
        fetchDrafts()
        return
      }

      const res = await axios.post('/api/send/bulk-start', { delay: sendDelay })
      setSendProgress(res.data)
      
      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progressRes = await axios.get('/api/send/progress')
          setSendProgress(progressRes.data)
          
          if (progressRes.data.status === 'completed' || progressRes.data.status === 'error') {
            clearInterval(pollInterval)
            setSending(false)
            if (progressRes.data.status === 'completed') {
              const failedText = progressRes.data.failed ? ` (${progressRes.data.failed} failed)` : ''
              alert(`Sent ${progressRes.data.sent} emails successfully!${failedText}`)
              fetchDrafts()
              setShowSendModal(false)
              setSendProgress(null)
            } else {
              setSendError(progressRes.data.error || 'Some emails failed to send')
            }
          }
        } catch (err) {
          console.error('Poll error:', err)
        }
      }, 2000)
      
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message
      setSendError(errorMsg)
      setSending(false)
      setSendProgress(null)
    }
  }

  const sendableCount = drafts.filter(d => d.status === 'approved' || d.status === 'draft').length
  const approvedCount = drafts.filter(d => d.status === 'approved').length

  if (loading) {
    return <div className="p-8 text-slate-300">Loading drafts...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-100">Drafts</h1>
          <p className="text-slate-400 mt-2">Review and approve emails before sending</p>
        </div>
        {drafts.filter(d => d.status !== 'sent').length > 0 && (
          <button
            onClick={() => setShowSendModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
          >
            <Send size={20} />
            Send All ({drafts.filter(d => d.status !== 'sent').length})
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {['draft', 'approved', 'scheduled', 'rejected', 'sent'].map(status => (
          <button
            key={status}
            onClick={() => { setFilter(status); setLoading(true) }}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === status ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {drafts.length > 0 ? (
        <div className="space-y-3">
          {drafts.map((draft, index) => (
            <div key={draft.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <span className="text-slate-500 font-mono text-sm mt-1">#{index + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-100">{draft.first_name} {draft.last_name}</p>
                      {draft.status === 'scheduled' && draft.scheduled_at && (
                        <span className="flex items-center gap-1 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                          <Clock size={12} />
                          {new Date(draft.scheduled_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">{draft.email}</p>
                    <p className="text-sm text-slate-300 mt-2 font-medium">{draft.subject}</p>
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">{draft.body}</p>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  {draft.status === 'draft' && (
                    <>
                      <button
                        onClick={() => setEditingDraft({ ...draft })}
                        className="p-2 bg-slate-600 hover:bg-slate-500 rounded text-slate-200 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => approveDraft(draft.id)}
                        className="p-2 bg-green-600 hover:bg-green-700 rounded text-white transition-colors"
                        title="Approve"
                      >
                        <CheckCircle size={18} />
                      </button>
                      <button
                        onClick={() => rejectDraft(draft.id)}
                        className="p-2 bg-red-600 hover:bg-red-700 rounded text-white transition-colors"
                        title="Reject"
                      >
                        <XCircle size={18} />
                      </button>
                      <button
                        onClick={() => deleteDraft(draft)}
                        className="p-2 bg-slate-700 hover:bg-red-600 rounded text-slate-300 hover:text-white transition-all"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                  {draft.status === 'approved' && (
                    <>
                      <button
                        onClick={() => {
                          const now = new Date()
                          now.setHours(now.getHours() + 1)
                          setScheduleDate(now.toISOString().split('T')[0])
                          setScheduleTime(now.toTimeString().slice(0, 5))
                          setScheduleDraft(draft)
                        }}
                        className="p-2 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                        title="Schedule"
                      >
                        <Calendar size={18} />
                      </button>
                      <button
                        onClick={() => {
                          setSingleSendDraft(draft)
                          setShowSendModal(true)
                          setSendError(null)
                        }}
                        className="p-2 bg-green-600 hover:bg-green-700 rounded text-white transition-colors"
                        title="Send Now"
                      >
                        <Send size={18} />
                      </button>
                      <button
                        onClick={() => deleteDraft(draft)}
                        className="p-2 bg-slate-700 hover:bg-red-600 rounded text-slate-300 hover:text-white transition-all"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                  {draft.status === 'scheduled' && (
                    <button
                      onClick={() => deleteDraft(draft)}
                      className="p-2 bg-red-600 hover:bg-red-700 rounded text-white transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                  {draft.status === 'rejected' && (
                    <button
                      onClick={() => deleteDraft(draft)}
                      className="p-2 bg-slate-700 hover:bg-red-600 rounded text-slate-300 hover:text-white transition-all"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12 text-slate-400">
          No {filter} drafts
        </div>
      )}

      {/* Edit Modal */}
      {editingDraft && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-slate-100 mb-4">Edit Draft</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">To (Email)</label>
                <input
                  type="email"
                  value={editingDraft.email || ''}
                  onChange={e => setEditingDraft({ ...editingDraft, email: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Subject</label>
                <input
                  type="text"
                  value={editingDraft.subject}
                  onChange={e => setEditingDraft({ ...editingDraft, subject: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Body</label>
                <textarea
                  value={editingDraft.body}
                  onChange={e => setEditingDraft({ ...editingDraft, body: e.target.value })}
                  rows={12}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 font-mono text-sm"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-600 text-white rounded-lg flex items-center justify-center gap-2"
                >
                  {savingEdit ? <Loader2 size={18} className="animate-spin" /> : null}
                  Save Changes
                </button>
                <button
                  onClick={() => setEditingDraft(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {scheduleDraft && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-slate-100 mb-4">Schedule Email</h2>
            <p className="text-slate-400 text-sm mb-4">
              Send to: <span className="text-slate-200">{scheduleDraft.email}</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={saveSchedule}
                  disabled={scheduling || !scheduleDate || !scheduleTime}
                  className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 text-white rounded-lg flex items-center justify-center gap-2"
                >
                  {scheduling ? <Loader2 size={18} className="animate-spin" /> : <Calendar size={18} />}
                  Schedule
                </button>
                <button
                  onClick={() => { setScheduleDraft(null); setScheduleDate(''); setScheduleTime('') }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send All Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-slate-100 mb-4">Send All Emails</h2>
            
            {sendProgress ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-slate-300 mb-2">Sending emails via Webmail...</p>
                  <p className="text-2xl font-bold text-slate-100">
                    {sendProgress.sent} / {sendProgress.total || sendableCount}
                    {sendProgress.failed > 0 && (
                      <span className="text-red-400 text-sm ml-2 font-medium">
                        ({sendProgress.failed} failed)
                      </span>
                    )}
                  </p>
                  {sendProgress.current && (
                    <p className="text-sm text-slate-400 mt-2">Now sending: {sendProgress.current}</p>
                  )}
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${sendProgress.total ? (sendProgress.sent / sendProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="pt-2 text-center">
                  <button
                    onClick={() => {
                      setShowSendModal(false)
                      setSendProgress(null)
                      setSending(false)
                      fetchDrafts()
                    }}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {sendError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                    <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="text-red-300 text-sm font-medium">Error</p>
                      <p className="text-red-400/80 text-xs mt-1">{sendError}</p>
                    </div>
                  </div>
                )}

                <p className="text-slate-400">
                  {singleSendDraft ? (
                    <>Sending <span className="text-slate-100 font-bold">1</span> email to <span className="text-indigo-400">{singleSendDraft.email}</span>.</>
                  ) : (
                    <>You have <span className="text-slate-100 font-bold">{approvedCount}</span> approved emails ready to send.</>
                  )}
                </p>
                
                {!singleSendDraft && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      <Zap size={16} className="inline mr-1" />
                      Delay between each email
                    </label>
                    <select
                      value={sendDelay}
                      onChange={e => setSendDelay(Number(e.target.value))}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      {DELAY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={startSending}
                    disabled={sending}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white rounded-lg flex items-center justify-center gap-2 font-medium transition-all transform active:scale-[0.98]"
                  >
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    {singleSendDraft ? 'Send Now' : 'Start Sending'}
                  </button>
                  <button
                    onClick={() => {
                      setShowSendModal(false)
                      setSingleSendDraft(null)
                      setSendError(null)
                    }}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}