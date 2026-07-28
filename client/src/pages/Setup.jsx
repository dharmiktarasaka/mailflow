import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { Mail, Loader2, Check, Key, Save, AlertCircle } from 'lucide-react'

export default function Setup() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(null)
  const [accounts, setAccounts] = useState([])
  
  // API Keys state
  const [apiKey, setApiKey] = useState('')
  const [savingApiKey, setSavingApiKey] = useState(false)
  const [apiKeySaved, setApiKeySaved] = useState(false)
  
  // OAuth Credentials state
  const [oauthCreds, setOauthCreds] = useState({
    gmail_client_id: '',
    gmail_client_secret: '',
    outlook_client_id: '',
    outlook_client_secret: '',
  })
  const [savingCreds, setSavingCreds] = useState(false)
  const [showCredsForm, setShowCredsForm] = useState(false)
  const [credsSaved, setCredsSaved] = useState(false)

  useEffect(() => {
    const connectedParam = searchParams.get('connected')
    const errorParam = searchParams.get('error')
    const detailsParam = searchParams.get('details')

    if (errorParam) {
      setError(`OAuth Error: ${errorParam}${detailsParam ? ` - ${detailsParam}` : ''}`)
      setSearchParams({})
    } else if (connectedParam) {
      setConnected(connectedParam)
      setSearchParams({})
      setTimeout(() => {
        window.location.href = '/'
      }, 1500)
    } else {
      fetchAccounts()
      fetchOauthCreds()
      fetchApiKey()
    }
  }, [searchParams])

  async function fetchAccounts() {
    try {
      const res = await axios.get('/auth/accounts')
      setAccounts(res.data)
      if (res.data.length > 0) {
        setTimeout(() => {
          window.location.href = '/dashboard'
        }, 1000)
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err)
    }
  }

  async function fetchApiKey() {
    try {
      const res = await axios.get('/api/config/api-keys')
      if (res.data && res.data.length > 0) {
        // Find Anthropic API key
        const anthropicKey = res.data.find(k => k.provider === 'anthropic')
        if (anthropicKey) {
          setApiKey('••••••••••••••••')
          setApiKeySaved(true)
        }
      }
    } catch (err) {
      console.error('Failed to fetch API keys:', err)
    }
  }

  async function connectGmail() {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get('/auth/gmail')
      if (!res.data.url) {
        throw new Error('No auth URL returned')
      }
      window.location.href = res.data.url
    } catch (err) {
      console.error('Gmail auth error:', err)
      setError(err.response?.data?.error || 'Failed to connect Gmail')
      setLoading(false)
    }
  }

  async function connectOutlook() {
    console.log('Connect Outlook button clicked')
    setLoading(true)
    setError(null)
    try {
      console.log('Making request to /auth/outlook')
      const res = await axios.get('/auth/outlook')
      console.log('Response received:', res.data)
      if (!res.data.url) {
        throw new Error('No auth URL returned')
      }
      console.log('Redirecting to:', res.data.url)
      window.location.href = res.data.url
    } catch (err) {
      console.error('Outlook auth error:', err)
      setError(err.response?.data?.error || 'Failed to connect Outlook')
      setLoading(false)
    }
  }

  async function fetchOauthCreds() {
    try {
      const res = await axios.get('/api/config/oauth-credentials')
      if (res.data) {
        setOauthCreds(res.data)
        // Consider credentials saved if at least one service is configured
        if (res.data.gmail_client_id || res.data.outlook_client_id) {
          setCredsSaved(true)
        }
      }
    } catch (err) {
      console.error('Failed to fetch OAuth credentials:', err)
    }
  }

  async function saveApiKey() {
    if (!apiKey || apiKey.startsWith('••••')) {
      setError('Please enter a valid Anthropic API key')
      return
    }

    try {
      setSavingApiKey(true)
      await axios.post('/api/config/api-keys', {
        provider: 'anthropic',
        apiKey: apiKey,
        model: 'claude-3-7-sonnet-20250219',
      })
      setApiKeySaved(true)
      setApiKey('••••••••••••••••')
      setError(null)
    } catch (err) {
      console.error('Failed to save API key:', err)
      setError('Failed to save API key')
    } finally {
      setSavingApiKey(false)
    }
  }

  async function saveOauthCreds() {
    try {
      setSavingCreds(true)
      await axios.post('/api/config/oauth-credentials', oauthCreds)
      setCredsSaved(true)
      setShowCredsForm(false)
      setError(null)
    } catch (err) {
      console.error('Failed to save credentials:', err)
      setError('Failed to save OAuth credentials')
    } finally {
      setSavingCreds(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-indigo-600 mb-2">
            MailFlow
          </h1>
          <p className="text-slate-400 text-lg">Complete your setup to get started</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-3">
            <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
            <span className="text-red-300">{error}</span>
          </div>
        )}

        {connected && (
          <div className="mb-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center gap-3">
            <Check className="text-green-400" size={24} />
            <span className="text-green-300 font-medium">
              ✓ {connected.charAt(0).toUpperCase() + connected.slice(1)} connected! Redirecting...
            </span>
          </div>
        )}

        {accounts.length > 0 && (
          <div className="mb-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center gap-3">
            <Check className="text-green-400" size={24} />
            <span className="text-green-300 font-medium">
              ✓ Email account connected! Redirecting to dashboard...
            </span>
          </div>
        )}

        {/* Progress Step 1: API Key */}
        <div className="mb-6 card bg-slate-800/50 border-2 border-indigo-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{
              background: apiKeySaved ? 'rgba(34, 197, 94, 0.2)' : 'rgba(99, 102, 241, 0.2)'
            }}>
              {apiKeySaved ? (
                <Check size={20} className="text-green-400" />
              ) : (
                <span className="text-indigo-400 font-bold">1</span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">AI Provider API Key</h2>
              <p className="text-slate-400 text-sm">Set up Claude (Anthropic) for AI email generation</p>
            </div>
          </div>

          {!apiKeySaved || (apiKeySaved && showCredsForm) ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Anthropic API Key</label>
                <input
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  disabled={apiKeySaved}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>
              <button
                onClick={saveApiKey}
                disabled={savingApiKey || !apiKey}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {savingApiKey ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    Save API Key
                  </>
                )}
              </button>
              <p className="text-xs text-slate-500">
                Get your free API key from{' '}
                <a href="https://console.anthropic.com" target="_blank" rel="noopener" className="text-indigo-400 hover:underline">
                  Anthropic Console
                </a>
              </p>
            </div>
          ) : (
            <div className="p-3 bg-green-500/10 rounded-lg flex items-center gap-3">
              <Check size={20} className="text-green-400" />
              <span className="text-green-300 text-sm">✓ Anthropic API key configured</span>
            </div>
          )}
        </div>

        {/* Progress Step 2: OAuth Credentials */}
        <div className="mb-6 card bg-slate-800/50 border-2 border-indigo-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{
              background: credsSaved ? 'rgba(34, 197, 94, 0.2)' : 'rgba(99, 102, 241, 0.2)'
            }}>
              {credsSaved ? (
                <Check size={20} className="text-green-400" />
              ) : (
                <span className="text-indigo-400 font-bold">2</span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">OAuth Credentials</h2>
              <p className="text-slate-400 text-sm">Gmail & Outlook OAuth for email connectivity (at least one required)</p>
            </div>
          </div>

          {(!credsSaved || showCredsForm) && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Gmail Client ID (Optional)</label>
                <input
                  type="text"
                  placeholder="Your Gmail Client ID from Google Cloud Console"
                  value={oauthCreds.gmail_client_id}
                  onChange={e => setOauthCreds({ ...oauthCreds, gmail_client_id: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Gmail Client Secret (Optional)</label>
                <input
                  type="password"
                  placeholder="Your Gmail Client Secret"
                  value={oauthCreds.gmail_client_secret}
                  onChange={e => setOauthCreds({ ...oauthCreds, gmail_client_secret: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-700">
                <label className="block text-sm font-medium text-slate-300 mb-2">Outlook Client ID (Optional)</label>
                <input
                  type="text"
                  placeholder="Your Outlook/Microsoft Client ID"
                  value={oauthCreds.outlook_client_id}
                  onChange={e => setOauthCreds({ ...oauthCreds, outlook_client_id: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Outlook Client Secret (Optional)</label>
                <input
                  type="password"
                  placeholder="Your Outlook/Microsoft Client Secret"
                  value={oauthCreds.outlook_client_secret}
                  onChange={e => setOauthCreds({ ...oauthCreds, outlook_client_secret: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                onClick={saveOauthCreds}
                disabled={savingCreds || (!oauthCreds.gmail_client_id && !oauthCreds.outlook_client_id)}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {savingCreds ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    Save OAuth Credentials
                  </>
                )}
              </button>

              <p className="text-xs text-slate-500">
                Get Gmail credentials from{' '}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" className="text-indigo-400 hover:underline">
                  Google Cloud Console
                </a>
                {' '} | Outlook from{' '}
                <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener" className="text-indigo-400 hover:underline">
                  Azure Portal
                </a>
              </p>
            </div>
          )}

          {credsSaved && !showCredsForm && (
            <div className="space-y-2">
              <div className="p-3 bg-green-500/10 rounded-lg flex items-center gap-3">
                <Check size={20} className="text-green-400" />
                <span className="text-green-300 text-sm">✓ OAuth credentials configured</span>
              </div>
              <button
                onClick={() => setShowCredsForm(true)}
                className="w-full py-2 text-slate-400 hover:text-slate-300 text-sm font-medium transition-colors"
              >
                Edit Credentials
              </button>
            </div>
          )}
        </div>

        {/* Progress Step 3: Connect Email */}
        <div className="card bg-slate-800/50 border-2 border-indigo-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{
              background: accounts.length > 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(99, 102, 241, 0.2)'
            }}>
              {accounts.length > 0 ? (
                <Check size={20} className="text-green-400" />
              ) : (
                <span className="text-indigo-400 font-bold">3</span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Connect Email Account</h2>
              <p className="text-slate-400 text-sm">Authenticate your email to send campaigns</p>
            </div>
          </div>

          {accounts.length === 0 && (
            <div className="space-y-3">
              {oauthCreds.gmail_client_id && (
                <button
                  onClick={connectGmail}
                  disabled={loading || !credsSaved}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Mail size={20} />
                      Connect Gmail Account
                    </>
                  )}
                </button>
              )}
              
              {oauthCreds.outlook_client_id && (
                <button
                  onClick={connectOutlook}
                  disabled={loading || !credsSaved}
                  className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Mail size={20} />
                      Connect Outlook Account
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {accounts.length > 0 && (
            <div className="p-3 bg-green-500/10 rounded-lg flex items-center gap-3">
              <Check size={20} className="text-green-400" />
              <span className="text-green-300 text-sm">✓ {accounts[0].email} connected</span>
            </div>
          )}

          {!credsSaved && (
            <p className="text-xs text-slate-500 mt-4 text-center text-yellow-400">
              ⚠️ Complete steps 1 & 2 first to connect email
            </p>
          )}

          {credsSaved && !oauthCreds.gmail_client_id && !oauthCreds.outlook_client_id && (
            <p className="text-xs text-slate-500 mt-4 text-center text-yellow-400">
              ⚠️ Configure at least one email service (Gmail or Outlook) to connect
            </p>
          )}

          <p className="text-xs text-slate-500 mt-4 text-center">
            You'll be redirected to authorize MailFlow with your chosen email service
          </p>
        </div>

        <div className="mt-8 p-4 bg-slate-800/30 border border-slate-700 rounded-lg">
          <p className="text-sm text-slate-400">
            💡 <strong>Tips:</strong>
            <br />• Get Anthropic API key from{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
              console.anthropic.com
            </a>
            <br />• Get Google OAuth credentials from{' '}
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
              Google Cloud Console
            </a>
            <br />• Get Microsoft OAuth credentials from{' '}
            <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
              Azure Portal
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}