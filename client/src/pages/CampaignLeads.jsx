import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import axios from 'axios'
import { Upload, ArrowLeft, Trash2, Mail, CheckSquare, Square, Loader2, Edit2, Zap } from 'lucide-react'

export default function CampaignLeads() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState(null)
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [selectedLeads, setSelectedLeads] = useState([])
  const [deleting, setDeleting] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [savingLead, setSavingLead] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState(null)

  useEffect(() => {
    fetchCampaign()
    fetchLeads()
    
    const interval = setInterval(() => {
      axios.get('/api/leads', { params: { campaign_id: id } })
        .then(res => setLeads(res.data))
        .catch(err => console.error(err))
    }, 15000)
    
    return () => clearInterval(interval)
  }, [id])

  async function fetchCampaign() {
    try {
      const res = await axios.get(`/api/campaigns/${id}`)
      setCampaign(res.data)
    } catch (err) {
      console.error('Failed to fetch campaign:', err)
    }
  }

  async function fetchLeads() {
    try {
      const res = await axios.get('/api/leads', { params: { campaign_id: id } })
      setLeads(res.data)
    } catch (err) {
      console.error('Failed to fetch leads:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('campaign_id', id)

      const res = await axios.post('/api/leads/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setImportResult(res.data)
      
      // If duplicates found, show option to force import
      if (res.data.duplicates > 0 && res.data.duplicateEmails?.length > 0) {
        const force = confirm(
          `Found ${res.data.duplicates} duplicate email(s) in this campaign:\n\n${res.data.duplicateEmails.join(', ')}\n\nClick OK to import anyway (will skip duplicates), or Cancel to stop.`
        )
        if (force) {
          const forceFormData = new FormData()
          forceFormData.append('file', file)
          forceFormData.append('campaign_id', id)
          forceFormData.append('force_import', 'true')
          
          const forceRes = await axios.post('/api/leads/import-duplicates', forceFormData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
          setImportResult({ ...res.data, forceImported: forceRes.data.imported })
        }
      }
      
      fetchLeads()
    } catch (err) {
      alert('Import failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setImporting(false)
    }
  }

  async function deleteLead(leadId) {
    if (!confirm('Delete this lead?')) return
    try {
      await axios.delete(`/api/leads/${leadId}`)
      setLeads(leads.filter(l => l.id !== leadId))
      setSelectedLeads(selectedLeads.filter(l => l !== leadId))
    } catch (err) {
      alert('Failed to delete lead')
    }
  }

  async function deleteSelectedLeads() {
    if (selectedLeads.length === 0) return
    if (!confirm(`Delete ${selectedLeads.length} selected lead(s)?`)) return
    
    setDeleting(true)
    try {
      for (const leadId of selectedLeads) {
        await axios.delete(`/api/leads/${leadId}`)
      }
      setSelectedLeads([])
      fetchLeads()
    } catch (err) {
      alert('Failed to delete some leads')
    } finally {
      setDeleting(false)
    }
  }

  function toggleSelectAll() {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([])
    } else {
      setSelectedLeads(leads.map(l => l.id))
    }
  }

  function toggleSelectLead(leadId) {
    if (selectedLeads.includes(leadId)) {
      setSelectedLeads(selectedLeads.filter(l => l !== leadId))
    } else {
      setSelectedLeads([...selectedLeads, leadId])
    }
  }

  async function generateDrafts() {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await axios.post(`/api/leads/${id}/generate-drafts`)
      setGenerateResult(res.data)
      fetchLeads()
    } catch (err) {
      alert('AI generation failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setGenerating(false)
    }
  }

  async function saveLead() {
    if (!editingLead) return
    setSavingLead(true)
    try {
      await axios.put(`/api/leads/${editingLead.id}`, {
        first_name: editingLead.first_name,
        last_name: editingLead.last_name,
        email: editingLead.email,
        company: editingLead.company,
        website: editingLead.website,
        title: editingLead.title,
        status: editingLead.status,
        notes: editingLead.notes,
      })
      setEditingLead(null)
      fetchLeads()
    } catch (err) {
      alert('Failed to save lead')
    } finally {
      setSavingLead(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-slate-300">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(`/campaigns/${id}`)} className="p-2 hover:bg-slate-700 rounded">
          <ArrowLeft size={20} className="text-slate-400" />
        </button>
        <div>
          <h1 className="text-4xl font-bold text-slate-100">Leads</h1>
          <p className="text-slate-400 mt-2">{campaign?.name}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-100 mb-4">Import Leads</h2>
        <div className="flex items-center gap-4">
          <label className="btn btn-primary flex items-center gap-2 cursor-pointer">
            <Upload size={18} />
            {importing ? 'Importing...' : 'Import CSV/Excel'}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleImport}
              disabled={importing}
              className="hidden"
            />
          </label>
          <span className="text-slate-400 text-sm">Upload a file with columns: Name, Email, Company, Website, Title</span>
          <button
            onClick={generateDrafts}
            disabled={generating || leads.length === 0}
            className="btn btn-primary flex items-center gap-2 ml-auto"
          >
            {generating ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Zap size={18} />
            )}
            {generating ? 'Generating...' : 'Generate AI Drafts'}
          </button>
        </div>

        {generateResult && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-green-400 font-medium">
              ✓ Generated {generateResult.generated} AI drafts ({generateResult.total} leads processed)
            </p>
          </div>
        )}

        {importResult && (
          <div className="mt-4 p-4 bg-slate-700 rounded-lg">
            <p className="text-slate-100">Imported: {importResult.imported} leads</p>
            {importResult.forceImported > 0 && (
              <p className="text-green-400 text-sm">Force imported: {importResult.forceImported} (duplicates replaced)</p>
            )}
            <p className="text-slate-400 text-sm">
              Business: {importResult.business} | Personal: {importResult.personal} | Invalid: {importResult.invalid}
              {importResult.duplicates > 0 && ` | Duplicates: ${importResult.duplicates}`}
            </p>
            {importResult.duplicateEmails?.length > 0 && (
              <p className="text-amber-400 text-xs mt-2">
                Duplicate emails: {importResult.duplicateEmails.join(', ')}
              </p>
            )}
            {importResult.invalidEmails?.length > 0 && (
              <p className="text-red-400 text-xs mt-2">
                Invalid emails: {importResult.invalidEmails.join(', ')}
              </p>
            )}
            {importResult.errors?.length > 0 && (
              <p className="text-red-400 text-xs mt-2">
                Errors: {importResult.errors.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      {leads.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 text-sm"
            >
              {selectedLeads.length === leads.length ? (
                <CheckSquare size={18} />
              ) : (
                <Square size={18} />
              )}
              Select All ({leads.length})
            </button>
          </div>
          
          {selectedLeads.length > 0 && (
            <button
              onClick={deleteSelectedLeads}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white rounded-lg"
            >
              {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              Delete Selected ({selectedLeads.length})
            </button>
          )}
        </div>
      )}

      {leads.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
               <tr className="border-b border-slate-700">
                 <th className="text-left py-3 px-4 text-slate-400 w-10"></th>
                 <th className="text-left py-3 px-4 text-slate-400">Name</th>
                 <th className="text-left py-3 px-4 text-slate-400">Email</th>
                 <th className="text-left py-3 px-4 text-slate-400">LinkedIn Profile</th>
                 <th className="text-left py-3 px-4 text-slate-400">Company</th>
                 <th className="text-left py-3 px-4 text-slate-400">Type</th>
                 <th className="text-left py-3 px-4 text-slate-400">Status</th>
                 <th className="text-left py-3 px-4 text-slate-400">Actions</th>
               </tr>
             </thead>
            <tbody>
{leads.map(lead => (
                 <tr key={lead.id} className={`border-b border-slate-700 hover:bg-slate-700/30 ${selectedLeads.includes(lead.id) ? 'bg-indigo-500/10' : ''}`}>
                   <td className="p-4">
                     <button onClick={() => toggleSelectLead(lead.id)} className="text-slate-400 hover:text-slate-200">
                       {selectedLeads.includes(lead.id) ? (
                         <CheckSquare size={18} className="text-indigo-400" />
                       ) : (
                         <Square size={18} />
                       )}
                     </button>
                   </td>
                   <td className="p-4">{lead.first_name} {lead.last_name}</td>
                   <td className="p-4 text-slate-300">{lead.email}</td>
                   <td className="p-4 text-slate-300">{lead.linkedin_url || '-'}</td>
                   <td className="p-4 text-slate-300">{lead.company || '-'}</td>
                   <td className="p-4">
                     <span className={`px-2 py-1 rounded text-xs ${lead.email_type === 'business' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                       {lead.email_type}
                     </span>
                   </td>
                   <td className="p-4">
                     <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">
                       {lead.status}
                     </span>
                   </td>
                   <td className="p-4">
                     <div className="flex items-center gap-1">
                       <button 
                         onClick={() => setEditingLead({ ...lead })} 
                         className="p-2 hover:bg-slate-600 rounded"
                       >
                         <Edit2 size={16} className="text-blue-400" />
                       </button>
                       <button onClick={() => deleteLead(lead.id)} className="p-2 hover:bg-slate-600 rounded">
                         <Trash2 size={16} className="text-red-400" />
                       </button>
                     </div>
                   </td>
                 </tr>
               ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center py-12 text-slate-400">
          No leads yet. Import a CSV file above.
        </div>
      )}

      {/* Edit Lead Modal */}
      {editingLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-slate-100 mb-4">Edit Lead</h2>
            <div className="space-y-4">
<div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-sm font-medium text-slate-300 mb-1">First Name</label>
                   <input
                     type="text"
                     value={editingLead.first_name || ''}
                     onChange={e => setEditingLead({ ...editingLead, first_name: e.target.value })}
                     className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-slate-300 mb-1">Last Name</label>
                   <input
                     type="text"
                     value={editingLead.last_name || ''}
                     onChange={e => setEditingLead({ ...editingLead, last_name: e.target.value })}
                     className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                   />
                 </div>
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                 <input
                   type="email"
                   value={editingLead.email || ''}
                   onChange={e => setEditingLead({ ...editingLead, email: e.target.value })}
                   className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">LinkedIn Profile</label>
                 <input
                   type="text"
                   value={editingLead.linkedin_url || ''}
                   onChange={e => setEditingLead({ ...editingLead, linkedin_url: e.target.value })}
                   className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">Company</label>
                 <input
                   type="text"
                   value={editingLead.company || ''}
                   onChange={e => setEditingLead({ ...editingLead, company: e.target.value })}
                   className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">Website</label>
                 <input
                   type="text"
                   value={editingLead.website || ''}
                   onChange={e => setEditingLead({ ...editingLead, website: e.target.value })}
                   className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
                 <input
                   type="text"
                   value={editingLead.title || ''}
                   onChange={e => setEditingLead({ ...editingLead, title: e.target.value })}
                   className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
                 <select
                   value={editingLead.status || 'new'}
                   onChange={e => setEditingLead({ ...editingLead, status: e.target.value })}
                   className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                 >
                   <option value="new">New</option>
                   <option value="contacted">Contacted</option>
                   <option value="replied">Replied</option>
                   <option value="interested">Interested</option>
                   <option value="not_interested">Not Interested</option>
                   <option value="bounced">Bounced</option>
                 </select>
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
                 <textarea
                   value={editingLead.notes || ''}
                   onChange={e => setEditingLead({ ...editingLead, notes: e.target.value })}
                   rows={3}
                   className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100"
                 />
               </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={saveLead}
                  disabled={savingLead}
                  className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-600 text-white rounded-lg flex items-center justify-center gap-2"
                >
                  {savingLead ? <Loader2 size={18} className="animate-spin" /> : null}
                  Save Changes
                </button>
                <button
                  onClick={() => setEditingLead(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}