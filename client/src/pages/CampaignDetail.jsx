import { useParams } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { Upload, Zap, Send, ArrowLeft, Users, Clock, FileSpreadsheet, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function CampaignDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [campaign, setCampaign] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    fetchCampaign()
    fetchStats()
  }, [id])

  useEffect(() => {
    if (uploadResult) {
      fetchStats()
    }
  }, [uploadResult])

  async function fetchCampaign() {
    try {
      const res = await axios.get(`/api/campaigns/${id}`)
      setCampaign(res.data)
    } catch (err) {
      console.error('Failed to fetch campaign:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    try {
      const res = await axios.get(`/api/campaigns/${id}/stats`)
      setStats(res.data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  async function handleFile(file) {
    if (!file) return

    const ext = file.name.split('.').pop().toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      alert('Please upload a .csv or .xlsx file')
      return
    }

    setUploading(true)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await axios.post(`/api/leads/${id}/upload-and-generate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setUploadResult(res.data)
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    handleFile(file)
  }

  function handleDragOver(e) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    handleFile(file)
    e.target.value = ''
  }

  if (loading) {
    return <div className="p-8 text-slate-300">Loading...</div>
  }

  if (!campaign) {
    return (
      <div className="p-12 text-center max-w-md mx-auto card space-y-4 my-10">
        <h2 className="text-2xl font-bold text-slate-100">Campaign Not Found</h2>
        <p className="text-slate-400 text-sm">This campaign may have been deleted or the link is invalid.</p>
        <button onClick={() => navigate('/campaigns')} className="btn btn-primary w-full">
          Back to Campaigns
        </button>
      </div>
    )
  }

  const successfulDrafts = uploadResult?.results?.filter(r => r.success)?.length || 0
  const failedDrafts = uploadResult?.results?.filter(r => !r.success)?.length || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/campaigns')} className="p-2 hover:bg-slate-700 rounded">
          <ArrowLeft size={20} className="text-slate-400" />
        </button>
        <div>
          <h1 className="text-4xl font-bold text-slate-100">{campaign.name}</h1>
          <p className="text-slate-400 mt-2 text-sm line-clamp-1">{campaign.master_prompt?.substring(0, 120)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-slate-400 text-sm">Total Leads</p>
          <p className="text-2xl font-bold text-slate-100">{stats?.total_leads || 0}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Drafts Ready</p>
          <p className="text-2xl font-bold text-slate-100">{stats?.draft_count || 0}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Sent</p>
          <p className="text-2xl font-bold text-slate-100">{stats?.sent_leads || 0}</p>
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm">Replies</p>
          <p className="text-2xl font-bold text-green-400">{stats?.replied_leads || 0}</p>
        </div>
      </div>

      {/* Excel Upload Section */}
      <div className="card">
        <h2 className="text-xl font-bold text-slate-100 mb-2">Import Leads from Excel</h2>
        <p className="text-slate-400 text-sm mb-4">Upload a .xlsx or .csv file with columns like Email, LinkedIn Profile Data, LinkedIn Profile URL, First Name, Last Name, Company, Title, Notes.</p>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-indigo-400 bg-indigo-500/10'
              : 'border-slate-600 hover:border-indigo-500/50 bg-slate-800/50'
          } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={40} className="animate-spin text-indigo-400" />
              <p className="text-slate-300">Uploading and creating email drafts...</p>
              <p className="text-xs text-slate-500">This may take a moment</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <FileSpreadsheet size={40} className="text-indigo-400" />
              <p className="text-slate-300 font-medium">Drop your Excel file here, or click to browse</p>
              <p className="text-xs text-slate-500">Supports .xlsx and .csv files</p>
            </div>
          )}
        </div>

        {uploadResult && (
          <div className="mt-6 space-y-4">
            <div className={`p-4 rounded-lg ${uploadResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}>
              <div className="flex items-center gap-2 mb-2">
                {uploadResult.success ? (
                  <CheckCircle size={20} className="text-green-400" />
                ) : (
                  <XCircle size={20} className="text-amber-400" />
                )}
                <span className="font-medium text-slate-100">Import Complete</span>
              </div>
              <div className="text-sm text-slate-300 space-y-1">
                <p>Total rows: <span className="font-medium">{uploadResult.total_rows}</span></p>
                <p>Imported: <span className="font-medium text-green-400">{uploadResult.imported}</span></p>
                {uploadResult.duplicates > 0 && (
                  <p>Duplicates skipped: <span className="font-medium text-amber-400">{uploadResult.duplicates}</span></p>
                )}
                <p>AI drafts generated: <span className="font-medium text-indigo-400">{uploadResult.drafts_created}</span></p>
              </div>
            </div>

            {uploadResult.results?.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-slate-100 mb-3">Generated Emails</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 px-4 text-slate-400">Email</th>
                        <th className="text-left py-3 px-4 text-slate-400">LinkedIn URL</th>
                        <th className="text-left py-3 px-4 text-slate-400">Subject</th>
                        <th className="text-left py-3 px-4 text-slate-400">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.results.map((r, i) => (
                        <tr key={i} className="border-b border-slate-700 hover:bg-slate-700/30">
                          <td className="py-3 px-4 text-slate-200">{r.email}</td>
                          <td className="py-3 px-4 text-slate-400 max-w-[200px] truncate">{(typeof r.linkedin_summary === 'string' ? r.linkedin_summary.substring(0, 80) : JSON.stringify(r.linkedin_summary || '').substring(0, 80)) || '-'}</td>
                          <td className="py-3 px-4 text-slate-300 max-w-[250px] truncate">{r.subject || '-'}</td>
                          <td className="py-3 px-4">
                            {r.success ? (
                              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">Generated</span>
                            ) : (
                              <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded" title={r.error}>Failed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {uploadResult.errors?.length > 0 && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400 font-medium mb-1">Errors ({uploadResult.errors.length})</p>
                <ul className="text-xs text-red-300 space-y-1">
                  {uploadResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="card">
        <h2 className="text-xl font-bold text-slate-100 mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate(`/campaigns/${id}/leads`)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Users size={18} />
            View All Leads
          </button>
          <button
            onClick={() => navigate('/drafts')}
            className="btn btn-primary flex items-center gap-2"
          >
            <Send size={18} />
            Review & Send Drafts
          </button>
          <button
            onClick={() => navigate(`/campaigns/${id}/followups`)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Clock size={18} />
            Follow-up History
          </button>
        </div>
      </div>

      {/* Custom Follow-Up Templates Section */}
      <div className="card space-y-4">
        <div className="flex justify-between items-center border-b border-slate-700 pb-3">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Clock size={20} className="text-indigo-400" /> Custom Follow-Up Templates (4 Rounds)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Pre-written manual follow-up emails automatically sent at specified day intervals</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {(campaign.followup_templates || []).map((fu, idx) => (
            <div key={fu.sequence || idx} className="p-4 bg-slate-900/80 rounded-lg border border-slate-700 space-y-2">
              <div className="flex justify-between items-center">
                <span className="bg-indigo-600/30 text-indigo-300 font-bold px-2.5 py-0.5 rounded text-xs">
                  Round #{fu.sequence}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Delay: <strong className="text-indigo-400 font-bold">{fu.delay_days} days</strong> {fu.enabled ? '' : '(Disabled)'}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-200 line-clamp-1">{fu.subject || 'No Subject'}</p>
              <p className="text-xs text-slate-400 line-clamp-3 font-mono whitespace-pre-wrap leading-relaxed">{fu.body || 'No Body'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign Details */}
      <div className="card">
        <h2 className="text-xl font-bold text-slate-100 mb-4">Email Prompt / Template</h2>
        <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
          <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">{campaign.master_prompt || campaign.body_template}</pre>
        </div>
      </div>
    </div>
  )
}
