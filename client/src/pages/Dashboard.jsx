import { useEffect, useState } from 'react'
import axios from 'axios'
import StatCard from '../components/StatCard'
import { BarChart3, Mail, MessageSquare, TrendingUp, AlertCircle, Clock, Key, Zap, Plus, Check, X, Loader2 } from 'lucide-react'

const PROVIDERS = [
  { id: 'groq', name: 'Groq', icon: '⚡' },
  { id: 'anthropic', name: 'Anthropic', icon: '🧠' },
  { id: 'openai', name: 'OpenAI', icon: '🤖' },
  { id: 'grok', name: 'xAI (Grok)', icon: '🚀' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🔮' },
  { id: 'gemini', name: 'Google Gemini', icon: '🌟' },
  { id: 'mistral', name: 'Mistral AI', icon: '🏔️' },
  { id: 'abhibot', name: 'abhibot', icon: '🤖' },
]

const MODELS = {
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
  ],
  anthropic: [
    { id: 'claude-3-7-opus-20250219', name: 'Claude 3.7 Opus' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
  ],
  openai: [
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  ],
  grok: [
    { id: 'grok-2', name: 'Grok 2' },
    { id: 'grok-beta', name: 'Grok Beta' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
  ],
  gemini: [
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  ],
  mistral: [
    { id: 'mistral-small-latest', name: 'Mistral Small' },
    { id: 'mistral-medium-latest', name: 'Mistral Medium' },
    { id: 'mistral-large-latest', name: 'Mistral Large' },
  ],
  abhibot: [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  ],
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [apiKeys, setApiKeys] = useState([])
  const [showApiForm, setShowApiForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [newKey, setNewKey] = useState({
    provider: 'groq',
    apiKey: '',
    model: '',
  })

  useEffect(() => {
    fetchData()
    fetchApiKeys()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [])

  async function fetchData() {
    try {
      const [statsRes, overviewRes] = await Promise.all([
        axios.get('/api/dashboard/stats'),
        axios.get('/api/dashboard/overview'),
      ])
      setStats(statsRes.data)
      setOverview(overviewRes.data)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchApiKeys() {
    try {
      const res = await axios.get('/api/config/api-keys')
      setApiKeys(res.data)
    } catch (err) {
      console.error('Failed to fetch API keys:', err)
    }
  }

  async function saveApiKey() {
    if (!newKey.apiKey) return
    setSaving(true)
    try {
      await axios.post('/api/config/api-keys', {
        provider: newKey.provider,
        apiKey: newKey.apiKey,
        model: newKey.model || MODELS[newKey.provider]?.[0]?.id,
      })
      setNewKey({ provider: 'groq', apiKey: '', model: '' })
      setShowApiForm(false)
      fetchApiKeys()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function testApiKey(id) {
    try {
      const res = await axios.post(`/api/config/api-keys/${id}/test`)
      if (res.data.valid) {
        alert(`✅ Connected! Using ${res.data.model}`)
      } else {
        alert(`❌ Invalid: ${res.data.error}`)
      }
    } catch (err) {
      alert('Test failed')
    }
  }

  async function deleteApiKey(id) {
    if (!confirm('Delete this API key?')) return
    try {
      await axios.delete(`/api/config/api-keys/${id}`)
      fetchApiKeys()
    } catch (err) {
      alert('Failed to delete')
    }
  }

  async function activateApiKey(id) {
    try {
      await axios.post(`/api/config/api-keys/${id}/activate`)
      fetchApiKeys()
    } catch (err) {
      alert('Failed to activate')
    }
  }

  const hasApiKey = apiKeys.length > 0

  if (loading) {
    return <div className="p-8 text-slate-300">Loading...</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-slate-400 mt-2">Welcome to your email outreach command center</p>
      </div>

      {!hasApiKey && (
        <div className="p-6 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-500/20 rounded-lg">
              <Zap className="text-amber-400" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-amber-300 mb-1">Enable AI Email Generation</h3>
              <p className="text-slate-400 text-sm mb-4">
                Add an AI provider (like Groq, OpenAI, Claude) to generate personalized emails automatically.
              </p>
              {showApiForm ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={newKey.provider}
                      onChange={e => setNewKey({ ...newKey, provider: e.target.value, model: '' })}
                      className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm"
                    >
                      {PROVIDERS.map(p => (
                        <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                      ))}
                    </select>
                    <select
                      value={newKey.model}
                      onChange={e => setNewKey({ ...newKey, model: e.target.value })}
                      className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm"
                    >
                      {(MODELS[newKey.provider] || []).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="Enter API key"
                      value={newKey.apiKey}
                      onChange={e => setNewKey({ ...newKey, apiKey: e.target.value })}
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm placeholder-slate-500"
                    />
                    <button
                      onClick={saveApiKey}
                      disabled={saving || !newKey.apiKey}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-600 text-white rounded-lg text-sm flex items-center gap-2"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Save
                    </button>
                    <button
                      onClick={() => setShowApiForm(false)}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowApiForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium"
                >
                  <Plus size={16} />
                  Add AI Provider
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {hasApiKey && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Check className="text-green-400" size={20} />
            <span className="text-green-300 text-sm">
              AI enabled: {apiKeys.find(k => k.isActive)?.providerName || apiKeys[0].providerName} active
            </span>
          </div>
          {lastUpdated && (
            <span className="text-xs text-slate-500">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {showApiForm && hasApiKey && (
        <div className="card border-2 border-indigo-500">
          <h3 className="font-semibold text-slate-100 mb-4">Add Another AI Provider</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newKey.provider}
                onChange={e => setNewKey({ ...newKey, provider: e.target.value, model: '' })}
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm"
              >
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                ))}
              </select>
              <select
                value={newKey.model}
                onChange={e => setNewKey({ ...newKey, model: e.target.value })}
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm"
              >
                {(MODELS[newKey.provider] || []).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Enter API key"
                value={newKey.apiKey}
                onChange={e => setNewKey({ ...newKey, apiKey: e.target.value })}
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm placeholder-slate-500"
              />
              <button
                onClick={saveApiKey}
                disabled={saving || !newKey.apiKey}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-600 text-white rounded-lg text-sm"
              >
                {saving ? '...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {apiKeys.length > 1 && (
        <div className="card">
          <h3 className="font-medium text-slate-300 mb-3">Connected AI Providers</h3>
          <div className="space-y-2">
            {apiKeys.map(key => (
              <div key={key.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{PROVIDERS.find(p => p.id === key.provider)?.icon}</span>
                  <div>
                    <p className="text-slate-100 text-sm">{key.providerName} - {key.model}</p>
                    {key.isActive && <span className="text-xs text-green-400">Active</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => testApiKey(key.id)} className="text-xs px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded">Test</button>
                  {!key.isActive && (
                    <button onClick={() => activateApiKey(key.id)} className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded">Activate</button>
                  )}
                  <button onClick={() => deleteApiKey(key.id)} className="text-xs px-2 py-1 text-red-400 hover:bg-red-500/20 rounded">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Leads" value={stats?.total_leads} icon={TrendingUp} />
        <StatCard label="Emails Sent" value={stats?.sent_leads} icon={Mail} />
        <StatCard label="Replies Received" value={stats?.replied_leads} icon={MessageSquare} />
        <StatCard label="Reply Rate" value={`${stats?.reply_rate}%`} icon={BarChart3} />

        <StatCard label="Bounced" value={stats?.bounced_leads} icon={AlertCircle} />
      </div>

      {overview?.activeCampaigns?.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-slate-100 mb-4">Active Campaigns</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-400">Campaign</th>
                  <th className="text-left py-3 px-4 text-slate-400">Leads</th>
                  <th className="text-left py-3 px-4 text-slate-400">Sent</th>
                  <th className="text-left py-3 px-4 text-slate-400">Replies</th>
                </tr>
              </thead>
              <tbody>
                {overview.activeCampaigns.map(c => (
                  <tr key={c.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                    <td className="p-4 font-medium">{c.name}</td>
                    <td className="p-4 text-slate-300">{c.lead_count}</td>
                    <td className="p-4 text-slate-300">{c.sent_count}</td>
                    <td className="p-4 text-green-400">{c.reply_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {overview?.recentEvents?.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-slate-100 mb-4">Recent Activity</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {overview.recentEvents.map(event => (
              <div key={event.id} className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                <div className="flex-1">
                  <p className="text-slate-200">
                    <span className="font-medium">{event.first_name}</span>
                    {' '}
                    <span className="text-slate-400">
                      {event.event_type === 'sent' && 'email sent'}
                      {event.event_type === 'replied' && 'replied'}
                      {event.event_type === 'opened' && 'opened email'}
                      {event.event_type === 'drafted' && 'draft created'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}