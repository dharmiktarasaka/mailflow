import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { Mail, Trash2, Check, Plus, ChevronDown, Loader2, TestTube, Zap, Save, Key, Download, RotateCcw } from 'lucide-react'

const PROVIDERS = [
  { id: 'groq', name: 'Groq', icon: '⚡', defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'anthropic', name: 'Anthropic', icon: '🧠', defaultModel: 'claude-3-7-sonnet-20250219' },
  { id: 'openai', name: 'OpenAI', icon: '🤖', defaultModel: 'gpt-4o' },
  { id: 'grok', name: 'xAI (Grok)', icon: '🚀', defaultModel: 'grok-2' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🔮', defaultModel: 'deepseek-chat' },
  { id: 'together', name: 'Together AI', icon: '🔗', defaultModel: 'qwen3.5-122b-a10b' },
  { id: 'gemini', name: 'Google Gemini', icon: '🌟', defaultModel: 'gemini-2.5-flash' },
  { id: 'mistral', name: 'Mistral AI', icon: '🏔️', defaultModel: 'mistral-small-latest' },
  { id: 'abhibot', name: 'abhibot', icon: '🤖', defaultModel: 'claude-sonnet-4-6' },
]

const MODELS = {
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Versatile)' },
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
  ],
  anthropic: [
    { id: 'claude-3-7-opus-20250219', name: 'Claude 3.7 Opus' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
  ],
  openai: [
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  ],
  grok: [
    { id: 'grok-2', name: 'Grok 2' },
    { id: 'grok-2-vision-1212', name: 'Grok 2 Vision' },
    { id: 'grok-beta', name: 'Grok Beta' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder' },
  ],
  together: [
    { id: 'qwen3.5-122b-a10b', name: 'Qwen 3.5 122B (A10B)' },
    { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Instruct' },
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Instruct' },
    { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B Instruct' },
  ],
  gemini: [
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  ],
  mistral: [
    { id: 'mistral-small-latest', name: 'Mistral Small' },
    { id: 'mistral-medium-latest', name: 'Mistral Medium' },
    { id: 'mistral-large-latest', name: 'Mistral Large' },
    { id: 'open-mistral-nemo', name: 'Mistral Nemo' },
  ],
  abhibot: [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  ],
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(null)
  const [setupComplete, setSetupComplete] = useState(false)

  // API Keys state
  const [apiKeys, setApiKeys] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [savingKeys, setSavingKeys] = useState(false)
  const [testingKey, setTestingKey] = useState(null)

  // Form state
  const [newKey, setNewKey] = useState({
    provider: 'groq',
    apiKey: '',
    model: '',
  })

  // OAuth Credentials state
  const [oauthCreds, setOauthCreds] = useState({
    gmail_client_id: '',
    gmail_client_secret: '',
    outlook_client_id: '',
    outlook_client_secret: '',
  })
  const [savingCreds, setSavingCreds] = useState(false)
  const [showOauthForm, setShowOauthForm] = useState(false)

  // Backups state
  const [backups, setBackups] = useState([])
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState(null)
  const [backupInterval, setBackupInterval] = useState(60)
  const [savedInterval, setSavedInterval] = useState(60)
  const [savingInterval, setSavingInterval] = useState(false)
  const [downloadingBackup, setDownloadingBackup] = useState(false)
  const [uploadingBackup, setUploadingBackup] = useState(false)

  useEffect(() => {
    const setupCompleteParam = searchParams.get('setup_complete')
    if (setupCompleteParam) {
      setSetupComplete(true)
      setSearchParams({})
    }

    const connectedProvider = searchParams.get('connected')
    if (connectedProvider) {
      setConnected(connectedProvider)
      setSearchParams({})
      setTimeout(fetchAccounts, 500)
    } else {
      fetchAccounts()
    }

    fetchApiKeys()
    fetchOauthCreds()
    fetchBackups()
    fetchBackupInterval()
  }, [searchParams])

  async function fetchAccounts() {
    try {
      const res = await axios.get('/auth/accounts')
      setAccounts(res.data)
    } catch (err) {
      console.error('Failed to fetch accounts:', err)
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

  async function fetchOauthCreds() {
    try {
      const res = await axios.get('/api/config/oauth-credentials')
      if (res.data) {
        setOauthCreds(res.data)
      }
    } catch (err) {
      console.error('Failed to fetch OAuth credentials:', err)
    }
  }

  async function saveOauthCreds() {
    try {
      setSavingCreds(true)
      await axios.post('/api/config/oauth-credentials', oauthCreds)
      alert('OAuth credentials saved! Restart the server for changes to take effect.')
    } catch (err) {
      console.error('Failed to save OAuth credentials:', err)
      alert('Failed to save credentials')
    } finally {
      setSavingCreds(false)
    }
  }

  async function saveApiKey() {
    if (!newKey.apiKey) {
      alert('Please enter an API key')
      return
    }

    try {
      setSavingKeys(true)
      await axios.post('/api/config/api-keys', {
        provider: newKey.provider,
        apiKey: newKey.apiKey,
        model: newKey.model || MODELS[newKey.provider]?.[0]?.id,
      })

      setNewKey({ provider: 'groq', apiKey: '', model: '' })
      setShowAddForm(false)
      fetchApiKeys()
      alert('API key saved successfully!')
    } catch (err) {
      console.error('Failed to save API key:', err)
      alert(`Failed to save API key: ${err.response?.data?.error || err.message}`)
    } finally {
      setSavingKeys(false)
    }
  }

  async function deleteApiKey(id) {
    if (!confirm('Delete this API key?')) return
    try {
      await axios.delete(`/api/config/api-keys/${id}`)
      fetchApiKeys()
    } catch (err) {
      alert('Failed to delete API key')
    }
  }

  async function activateApiKey(id) {
    try {
      await axios.post(`/api/config/api-keys/${id}/activate`)
      fetchApiKeys()
    } catch (err) {
      alert('Failed to activate API key')
    }
  }

  async function testApiKey(id) {
    try {
      setTestingKey(id)
      const res = await axios.post(`/api/config/api-keys/${id}/test`)
      if (res.data.valid) {
        alert(`✅ ${res.data.provider.toUpperCase()} API is working! (Model: ${res.data.model})`)
      } else {
        alert(`❌ Test failed: ${res.data.error}`)
      }
    } catch (err) {
      alert(`❌ Test failed: ${err.response?.data?.error || err.message}`)
    } finally {
      setTestingKey(null)
    }
  }

  async function connectGmail() {
    try {
      const res = await axios.get('/auth/gmail')
      if (!res.data.url) {
        throw new Error('No auth URL returned from server')
      }
      window.location.href = res.data.url
    } catch (err) {
      console.error('Gmail auth error:', err)
      alert(`Failed to start Gmail auth: ${err.response?.data?.error || err.message}`)
    }
  }

  async function connectOutlook() {
    try {
      const res = await axios.get('/auth/outlook')
      window.location.href = res.data.url
    } catch (err) {
      alert(`Failed to start Outlook auth: ${err.response?.data?.error || err.message}`)
    }
  }

  async function deleteAccount(id) {
    if (!confirm('Disconnect this account?')) return
    try {
      await axios.delete(`/auth/accounts/${id}`)
      setAccounts(accounts.filter(a => (a._id || a.id) !== id))
    } catch (err) {
      alert('Failed to disconnect account')
    }
  }

  async function activateAccount(id) {
    try {
      await axios.post(`/auth/accounts/${id}/activate`)
      fetchAccounts()
    } catch (err) {
      alert('Failed to activate account')
    }
  }

  async function fetchBackups() {
    try {
      const res = await axios.get('/api/backups/list')
      setBackups(res.data || [])
    } catch (err) {
      console.error('Failed to fetch backups:', err)
    }
  }

  async function fetchBackupInterval() {
    try {
      const res = await axios.get('/api/config/backup-interval')
      setBackupInterval(res.data.intervalMinutes)
      setSavedInterval(res.data.intervalMinutes)
    } catch (err) {
      console.error('Failed to fetch backup interval:', err)
    }
  }

  async function saveBackupInterval() {
    try {
      setSavingInterval(true)
      await axios.post('/api/config/backup-interval', {
        intervalMinutes: parseInt(backupInterval)
      })
      setSavedInterval(backupInterval)
      alert('✓ Backup interval updated to ' + backupInterval + ' minutes')
    } catch (err) {
      alert('Failed to save backup interval: ' + (err.response?.data?.error || err.message))
    } finally {
      setSavingInterval(false)
    }
  }

  async function createBackup() {
    if (!confirm('Create a new backup now?')) return
    try {
      setCreatingBackup(true)
      await axios.post('/api/backups/create')
      alert('✓ Backup created successfully!')
      fetchBackups()
    } catch (err) {
      alert('Failed to create backup')
    } finally {
      setCreatingBackup(false)
    }
  }

  async function restoreBackup(backupName) {
    if (!confirm(`Restore from backup: ${backupName}?\n\nThis will replace your current database!`)) return
    try {
      setRestoringBackup(backupName)
      await axios.post(`/api/backups/restore/${backupName}`)
      alert('✓ Backup restored successfully! Reloading...')
      setTimeout(() => window.location.reload(), 1000)
    } catch (err) {
      alert(`Failed to restore backup: ${err.response?.data?.error || err.message}`)
    } finally {
      setRestoringBackup(null)
    }
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B'
    if (!bytes || isNaN(bytes)) return 'Unknown size'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    if (i < 0 || isNaN(i)) return bytes + ' B'
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleString()
  }

  async function downloadBackup() {
    try {
      setDownloadingBackup(true)
      const response = await axios.get('/api/backups/download', {
        responseType: 'blob',
      })

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `mailflow-backup-${new Date().toISOString().split('T')[0]}.db`)
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)

      console.log('✓ Backup downloaded')
    } catch (err) {
      alert('Failed to download backup: ' + (err.response?.data?.error || err.message))
    } finally {
      setDownloadingBackup(false)
    }
  }

  async function uploadBackup(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.includes('.db')) {
      alert('Please select a valid .db backup file')
      event.target.value = ''
      return
    }

    if (!confirm('This will replace your current database! Make sure you have a backup first. Continue?')) {
      event.target.value = ''
      return
    }

    try {
      setUploadingBackup(true)
      const formData = new FormData()
      formData.append('backup', file)

      const response = await axios.post('/api/backups/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      alert('✓ ' + response.data.message)

      if (response.data.requiresReload) {
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (err) {
      alert('Failed to upload backup: ' + (err.response?.data?.error || err.message))
    } finally {
      setUploadingBackup(false)
      event.target.value = ''
    }
  }

  if (loading) {
    return <div className="p-8 text-slate-300">Loading settings...</div>
  }

  return (
    <div className="space-y-8">
      {setupComplete && (
        <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
          <p className="text-green-300 font-medium">
            ✓ Setup complete! Your credentials are saved. Now connect your email account below.
          </p>
        </div>
      )}

      {connected && (
        <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
          <p className="text-green-300 font-medium">
            ✓ {connected.charAt(0).toUpperCase() + connected.slice(1)} account connected successfully!
          </p>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 mt-2">Configure your MailFlow account</p>
      </div>

      {/* AI API Keys */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">AI Providers</h2>
            <p className="text-slate-400 text-sm mt-1">Connect any AI provider to generate emails</p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors"
          >
            <Plus size={18} />
            Add Provider
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="mb-6 p-4 bg-slate-700/50 rounded-lg border border-indigo-500/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Provider</label>
                <select
                  value={newKey.provider}
                  onChange={e => setNewKey({ ...newKey, provider: e.target.value, model: '' })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Model</label>
                <select
                  value={newKey.model}
                  onChange={e => setNewKey({ ...newKey, model: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {(MODELS[newKey.provider] || []).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">API Key</label>
              <input
                type="password"
                placeholder="Enter your API key"
                value={newKey.apiKey}
                onChange={e => setNewKey({ ...newKey, apiKey: e.target.value })}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveApiKey}
                disabled={savingKeys}
                className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {savingKeys ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                Save API Key
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Connected API Keys */}
        {apiKeys.length > 0 ? (
          <div className="space-y-3">
            {apiKeys.map(key => (
              <div
                key={key.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${key.isActive
                    ? 'bg-indigo-500/10 border-indigo-500/50'
                    : 'bg-slate-700/50 border-slate-600'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <div className="text-2xl">
                    {PROVIDERS.find(p => p.id === key.provider)?.icon || '🔑'}
                  </div>
                  <div>
                    <p className="font-medium text-slate-100">
                      {key.providerName || key.provider}
                      {key.isActive && <span className="ml-2 text-xs bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded">Active</span>}
                    </p>
                    <p className="text-sm text-slate-400">{key.model}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => testApiKey(key.id)}
                    disabled={testingKey === key.id}
                    className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-600 rounded transition-colors"
                    title="Test API key"
                  >
                    {testingKey === key.id ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <TestTube size={18} />
                    )}
                  </button>
                  {!key.isActive && (
                    <button
                      onClick={() => activateApiKey(key.id)}
                      className="px-3 py-1 text-sm bg-indigo-500/20 text-indigo-400 rounded hover:bg-indigo-500/30 transition-colors"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => deleteApiKey(key.id)}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <Zap size={40} className="mx-auto mb-3 opacity-50" />
            <p>No AI providers connected yet</p>
            <p className="text-sm">Add a provider above to start generating emails</p>
          </div>
        )}
      </div>

      {/* OAuth Credentials */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">OAuth Credentials</h2>
            <p className="text-slate-400 text-sm mt-1">Required to connect Gmail/Outlook accounts</p>
          </div>
          <button
            onClick={() => setShowOauthForm(!showOauthForm)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors"
          >
            <Key size={18} />
            {showOauthForm ? 'Cancel' : 'Configure'}
          </button>
        </div>

        {showOauthForm && (
          <div className="mb-6 p-4 bg-slate-700/50 rounded-lg border border-indigo-500/50">
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Gmail Client ID</label>
              <input
                type="text"
                placeholder="Enter your Gmail Client ID"
                value={oauthCreds.gmail_client_id}
                onChange={e => setOauthCreds({ ...oauthCreds, gmail_client_id: e.target.value })}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Gmail Client Secret</label>
              <input
                type="password"
                placeholder="Enter your Gmail Client Secret"
                value={oauthCreds.gmail_client_secret}
                onChange={e => setOauthCreds({ ...oauthCreds, gmail_client_secret: e.target.value })}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Outlook Client ID (optional)</label>
              <input
                type="text"
                placeholder="Enter your Outlook Client ID"
                value={oauthCreds.outlook_client_id}
                onChange={e => setOauthCreds({ ...oauthCreds, outlook_client_id: e.target.value })}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Outlook Client Secret (optional)</label>
              <input
                type="password"
                placeholder="Enter your Outlook Client Secret"
                value={oauthCreds.outlook_client_secret}
                onChange={e => setOauthCreds({ ...oauthCreds, outlook_client_secret: e.target.value })}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveOauthCreds}
                disabled={savingCreds}
                className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {savingCreds ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Save Credentials
              </button>
            </div>
          </div>
        )}

        <div className="text-sm text-slate-400">
          <p className="mb-2">How to get credentials:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-500">
            <li>Gmail: <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" className="text-indigo-400 hover:underline">Google Cloud Console</a> → Create OAuth Client ID</li>
            <li>Outlook: <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener" className="text-indigo-400 hover:underline">Azure Portal</a> → App registrations</li>
          </ol>
        </div>
      </div>

      {/* Email Accounts */}
      <div className="card">
        <h2 className="text-2xl font-bold text-slate-100 mb-6">Email Accounts</h2>

        {accounts.length > 0 && (
          <div className="mb-8 space-y-3">
            <h3 className="text-sm font-medium text-slate-400 mb-4">Connected Accounts</h3>
            {accounts.map(account => (
              <div
                key={account._id || account.id}
                className="flex items-center justify-between p-4 bg-slate-700 rounded-lg border border-slate-600"
              >
                <div className="flex items-center gap-4">
                  {account.avatar_url && (
                    <img src={account.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                  )}
                  <div>
                    <p className="font-medium text-slate-100">{account.email}</p>
                    <p className="text-sm text-slate-400 capitalize">{account.provider}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {account.is_active ? (
                    <span className="flex items-center gap-1 text-green-400 text-sm">
                      <Check size={16} />
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => activateAccount(account._id || account.id)}
                      className="px-3 py-1 text-sm bg-indigo-500/20 text-indigo-400 rounded hover:bg-indigo-500/30 transition-colors"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => deleteAccount(account._id || account.id)}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-400 mb-4">Connect New Account</h3>

          <button
            onClick={connectGmail}
            className="w-full flex items-center justify-center gap-3 p-4 border-2 border-slate-600 hover:border-slate-500 rounded-lg transition-colors group"
          >
            <Mail size={20} className="text-red-400 group-hover:text-red-300" />
            <span className="text-slate-100 group-hover:text-slate-50">Connect Gmail</span>
          </button>

          <button
            onClick={connectOutlook}
            className="w-full flex items-center justify-center gap-3 p-4 border-2 border-slate-600 hover:border-slate-500 rounded-lg transition-colors group"
          >
            <Mail size={20} className="text-blue-400 group-hover:text-blue-300" />
            <span className="text-slate-100 group-hover:text-slate-50">Connect Outlook</span>
          </button>
        </div>
      </div>

      {/* Tracking Settings */}
      <div className="card">
        <h2 className="text-2xl font-bold text-slate-100 mb-6">Tracking Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-indigo-500" />
              Enable Open Tracking
            </label>
            <p className="text-slate-500 text-sm ml-6">Track email opens with 1x1 pixel</p>
          </div>
        </div>
      </div>

      {/* Database Backups */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">Database Backups</h2>
            <p className="text-slate-400 text-sm mt-1">Automatic backups protect your data from accidental loss</p>
          </div>
          <button
            onClick={createBackup}
            disabled={creatingBackup}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-slate-600 text-white rounded-lg transition-colors"
          >
            {creatingBackup ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Download size={18} />
                Create Backup
              </>
            )}
          </button>
          <button
            onClick={downloadBackup}
            disabled={downloadingBackup}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 text-white rounded-lg transition-colors"
            title="Download current database as .db file for external storage"
          >
            {downloadingBackup ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download size={18} />
                Download
              </>
            )}
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors cursor-pointer" title="Upload a previously downloaded backup file">
            {uploadingBackup ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Download size={18} className="rotate-180" />
                Upload
              </>
            )}
            <input
              type="file"
              accept=".db"
              onChange={uploadBackup}
              disabled={uploadingBackup}
              className="hidden"
            />
          </label>
        </div>

        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
          <p className="text-blue-300 text-sm mb-3">
            💡 <strong>Multi-tier backups:</strong> Your database is automatically backed up at startup, on schedule, and before shutdown. We keep 5 hourly, 7 daily, and 4 weekly backups for comprehensive recovery options.
          </p>
          <p className="text-blue-300 text-xs">
            <strong>Button explanation:</strong> <span className="text-yellow-200">Create Backup</span> manually creates backup, <span className="text-yellow-200">Download</span> exports database to your computer (includes all data, campaigns, leads, API keys, auth tokens), <span className="text-yellow-200">Upload</span> restores from a downloaded file.
          </p>
        </div>

        {/* Backup Interval Configuration */}
        <div className="mb-8 p-4 bg-slate-700/50 rounded-lg border border-indigo-500/50">
          <label className="block text-sm font-medium text-slate-300 mb-3">Auto-Backup Interval</label>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <select
                value={backupInterval}
                onChange={e => setBackupInterval(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every 1 hour (recommended)</option>
                <option value="120">Every 2 hours</option>
                <option value="240">Every 4 hours</option>
                <option value="480">Every 8 hours</option>
                <option value="1440">Daily</option>
              </select>
            </div>
            <button
              onClick={saveBackupInterval}
              disabled={savingInterval || backupInterval === savedInterval}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {savingInterval ? 'Saving...' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Current setting: <strong>{Number(savedInterval) || 60} minute{Number(savedInterval) !== 1 ? 's' : ''}</strong> between backups
          </p>
        </div>

        {backups.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-400 mb-4">Available Backups</h3>

            {/* Retention Policy Summary */}
            <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-slate-700/30 rounded-lg border border-slate-600">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{backups.filter(b => b.tier === 'hourly').length}</div>
                <div className="text-xs text-slate-400">Hourly (max 5)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{backups.filter(b => b.tier === 'daily').length}</div>
                <div className="text-xs text-slate-400">Daily (max 7)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{backups.filter(b => b.tier === 'weekly').length}</div>
                <div className="text-xs text-slate-400">Weekly (max 4)</div>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {backups.map((backup, index) => {
                const tierColors = {
                  hourly: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
                  daily: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
                  weekly: 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                }
                const tierColor = tierColors[backup.tier] || tierColors.weekly

                return (
                  <div
                    key={backup.name}
                    className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-slate-100 text-sm">
                          {index === 0 && <span className="text-green-400">⭐ </span>}
                          {backup.name}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded border ${tierColor} font-medium`}>
                          {backup.tier ? (backup.tier.charAt(0).toUpperCase() + backup.tier.slice(1)) : 'Manual'}
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs text-slate-400">
                        <span>📦 {formatFileSize(backup.size)}</span>
                        <span>📅 {formatDate(backup.created || backup.time)}</span>
                        {backup.reason && <span>🏷️ {backup.reason}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => restoreBackup(backup.name)}
                      disabled={restoringBackup === backup.name}
                      className="flex items-center gap-2 px-3 py-1.5 ml-4 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 disabled:bg-slate-600 disabled:text-slate-400 rounded text-sm transition-colors whitespace-nowrap"
                    >
                      {restoringBackup === backup.name ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Restoring...
                        </>
                      ) : (
                        <>
                          <RotateCcw size={14} />
                          Restore
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <Download size={40} className="mx-auto mb-3 opacity-50" />
            <p>No backups available yet</p>
            <p className="text-sm">Click the buttons above to create or upload your first backup</p>
          </div>
        )}

        <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
          <p className="text-yellow-300 text-sm mb-2">
            ⚠️ <strong>Portability:</strong> Use the Download button to backup your entire database (campaigns, leads, auth tokens, API keys) to external storage. Use Upload to restore it anytime.
          </p>
          <p className="text-slate-400 text-xs mt-2">
            💡 <strong>Note:</strong> WAL mode is enabled for automatic crash recovery. Combined with scheduled backups, your data is well-protected.
          </p>
        </div>
      </div>
    </div>
  )
}