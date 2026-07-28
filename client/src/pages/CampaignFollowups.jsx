import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeft, Edit2, Trash2, Clock, Send, XCircle, AlertCircle, Sparkles } from 'lucide-react'

export default function CampaignFollowups() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [followups, setFollowups] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingFollowup, setEditingFollowup] = useState(null)
  const [generatingAI, setGeneratingAI] = useState(false)

  useEffect(() => {
    fetchFollowups()

    const interval = setInterval(() => {
      axios.get(`/api/campaigns/${id}/followups`)
        .then(res => setFollowups(res.data))
        .catch(err => console.error(err))
    }, 15000)

    return () => clearInterval(interval)
  }, [id])

  async function fetchFollowups() {
    try {
      const res = await axios.get(`/api/campaigns/${id}/followups`)
      setFollowups(res.data)
    } catch (err) {
      console.error('Failed to fetch followups:', err)
    } finally {
      setLoading(false)
    }
  }

  async function deleteFollowup(followupId) {
    if (!confirm('Cancel and delete this follow-up?')) return
    try {
      await axios.delete(`/api/campaigns/${id}/followups/${followupId}`)
      fetchFollowups()
    } catch (err) {
      alert('Failed to delete')
    }
  }

  async function saveEdit() {
    if (!editingFollowup) return
    try {
      await axios.put(`/api/campaigns/${id}/followups/${editingFollowup.id}`, {
        subject: editingFollowup.subject,
        body: editingFollowup.body
      })
      setEditingFollowup(null)
      fetchFollowups()
    } catch (err) {
      alert('Failed to save')
    }
  }

  async function generateAIFollowup(followupId) {
    setGeneratingAI(true)
    try {
      const res = await axios.post(`/api/followups/${followupId}/generate`)
      // Update the editing followup with AI-generated content
      setEditingFollowup(prev => {
        if (!prev || prev.id !== followupId) return prev
        return {
          ...prev,
          subject: res.data.subject,
          body: res.data.body
        }
      })
    } catch (err) {
      console.error('Failed to generate AI followup:', err)
      alert('Failed to generate AI content')
    } finally {
      setGeneratingAI(false)
    }
  }

  if (loading) return <div className="p-8 text-slate-300">Loading follow-ups...</div>

  const totalSent = followups.filter(f => f.status === 'sent').length
  const totalPending = followups.filter(f => f.status === 'pending').length
  const totalCancelled = followups.filter(f => f.status === 'cancelled').length

  // Group by email
  const grouped = followups.reduce((acc, f) => {
    if (!acc[f.email]) acc[f.email] = []
    acc[f.email].push(f)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(`/campaigns/${id}`)} className="p-2 hover:bg-slate-700 rounded">
          <ArrowLeft size={20} className="text-slate-400" />
        </button>
        <div>
          <h1 className="text-4xl font-bold text-slate-100">Campaign Follow-ups</h1>
          <p className="text-slate-400 mt-2">History and pending schedule for this campaign</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="text-slate-400 text-sm">Total Sent</p>
          <p className="text-2xl font-bold text-green-400">{totalSent}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Total Pending</p>
          <p className="text-2xl font-bold text-blue-400">{totalPending}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Total Cancelled</p>
          <p className="text-2xl font-bold text-red-400">{totalCancelled}</p>
        </div>
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([email, emailFollowups]) => (
          <div key={email} className="card space-y-4">
            <h3 className="text-lg font-bold text-slate-100 border-b border-slate-700 pb-2">{email}</h3>

            <div className="space-y-3">
              {emailFollowups.map((followup) => (
                <div key={followup.id} className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-medium text-indigo-400">Round {followup.sequence}</span>
                        {followup.status === 'pending' && (
                          <span className="flex items-center gap-1 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                            <Clock size={12} /> Pending: {new Date(followup.scheduled_date).toLocaleString()}
                          </span>
                        )}
                        {followup.status === 'sent' && (
                          <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                            <Send size={12} /> Sent: {new Date(followup.sent_at).toLocaleString()}
                          </span>
                        )}
                        {followup.status === 'cancelled' && (
                          <span className="flex items-center gap-1 text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                            <XCircle size={12} /> Cancelled (Recipient replied)
                          </span>
                        )}
                        {followup.status === 'failed' && (
                          <span className="flex items-center gap-1 text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">
                            <AlertCircle size={12} /> Failed
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-slate-200">{followup.subject}</p>
                      <p className="text-sm text-slate-400 mt-1">{followup.body}</p>
                    </div>

                    <div className="flex gap-2">
                      {followup.status === 'pending' && (
                        <>
                          <button
                            onClick={() => setEditingFollowup({ ...followup })}
                            className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteFollowup(followup.id)}
                            className="p-2 bg-slate-700 hover:bg-red-600 rounded text-slate-300 hover:text-white transition-all"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-12 text-slate-400 card">
            No follow-ups generated yet for this campaign.
          </div>
        )}
      </div>

      {editingFollowup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-[backdropFadeIn_0.2s_ease]"
            onClick={() => setEditingFollowup(null)}
          ></div>
          <div className="relative w-full max-w-xl mx-auto animate-[modalFadeIn_0.3s_cubic-bezier(0.16,1,0.3,1)] pointer-events-auto">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 shrink-0">
                    <Edit2 size={18} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Edit Follow-up</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                      Round {editingFollowup.sequence} &middot; {editingFollowup.email || ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingFollowup(null)}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all duration-200 shrink-0"
                >
                  <XCircle size={20} />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Subject Line</label>
                    <span className="text-xs text-slate-400 tabular-nums">{(editingFollowup.subject || '').length}/200</span>
                  </div>
                  <input
                    type="text"
                    value={editingFollowup.subject || ''}
                    onChange={e => setEditingFollowup({ ...editingFollowup, subject: e.target.value.slice(0, 200) })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/30 transition-all duration-200"
                    placeholder="Enter email subject"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Body</label>
                    <span className="text-xs text-slate-400 tabular-nums">{(editingFollowup.body || '').length}/5000</span>
                  </div>
                  <textarea
                    value={editingFollowup.body || ''}
                    onChange={e => setEditingFollowup({ ...editingFollowup, body: e.target.value.slice(0, 5000) })}
                    rows={10}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 font-mono text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/30 transition-all duration-200 resize-y min-h-[200px]"
                    placeholder="Write your email content here..."
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-700/50">
                <button
                  onClick={() => setEditingFollowup(null)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700/80 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600/50 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
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