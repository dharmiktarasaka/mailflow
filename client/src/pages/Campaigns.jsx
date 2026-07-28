import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Plus, Trash2, Eye } from 'lucide-react'

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchCampaigns()
  }, [])

  async function fetchCampaigns() {
    try {
      const res = await axios.get('/api/campaigns')
      setCampaigns(res.data)
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
    } finally {
      setLoading(false)
    }
  }

  async function deleteCampaign(id) {
    if (!confirm('Delete this campaign?')) return
    try {
      await axios.delete(`/api/campaigns/${id}`)
      setCampaigns(campaigns.filter(c => c.id !== id))
    } catch (err) {
      alert('Failed to delete campaign')
    }
  }

  if (loading) {
    return <div className="p-8 text-slate-300">Loading campaigns...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-100">Campaigns</h1>
          <p className="text-slate-400 mt-2">Manage your outreach campaigns</p>
        </div>
        <button
          onClick={() => navigate('/campaigns/new')}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          New Campaign
        </button>
      </div>

      {/* Campaigns Table */}
      {campaigns.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-4 px-4 text-slate-400">Name</th>
                <th className="text-left py-4 px-4 text-slate-400">Leads</th>
                <th className="text-left py-4 px-4 text-slate-400">Sent</th>
                <th className="text-left py-4 px-4 text-slate-400">Replies</th>
                <th className="text-left py-4 px-4 text-slate-400">Status</th>
                <th className="text-left py-4 px-4 text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(campaign => (
                <tr key={campaign.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                  <td className="py-4 px-4 font-medium">{campaign.name}</td>
                  <td className="py-4 px-4 text-slate-300">{campaign.lead_count}</td>
                  <td className="py-4 px-4 text-slate-300">{campaign.sent_count}</td>
                  <td className="py-4 px-4 text-green-400">{campaign.reply_count}</td>
                  <td className="py-4 px-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        campaign.status === 'active'
                          ? 'bg-green-500/20 text-green-400'
                          : campaign.status === 'draft'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-slate-500/20 text-slate-400'
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 flex gap-2">
                    <button
                      onClick={() => navigate(`/campaigns/${campaign.id}`)}
                      className="p-2 hover:bg-slate-600 rounded transition-colors"
                    >
                      <Eye size={18} className="text-indigo-400" />
                    </button>
                    <button
                      onClick={() => deleteCampaign(campaign.id)}
                      className="p-2 hover:bg-slate-600 rounded transition-colors"
                    >
                      <Trash2 size={18} className="text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-slate-400 mb-4">No campaigns yet. Create your first one!</p>
          <button
            onClick={() => navigate('/campaigns/new')}
            className="btn btn-primary"
          >
            Create Campaign
          </button>
        </div>
      )}
    </div>
  )
}
