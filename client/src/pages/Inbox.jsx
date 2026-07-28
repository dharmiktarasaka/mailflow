import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { 
  Search, 
  RefreshCcw, 
  Send, 
  User, 
  Mail, 
  ExternalLink, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronRight,
  ArrowLeft,
  Building2,
  Briefcase
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function Inbox() {
  const [threads, setThreads] = useState([])
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const messagesEndRef = useRef(null)

  const activeThread = threads.find(t => t.id === activeThreadId)

  useEffect(() => {
    fetchThreads()
  }, [])

  useEffect(() => {
    if (activeThreadId) {
      fetchMessages(activeThreadId)
    }
  }, [activeThreadId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchThreads = async (isPolling = false) => {
    if (isPolling) setPolling(true)
    else setLoading(true)
    
    try {
      // First poll for new replies
      if (isPolling) {
        await axios.post('/api/inbox/poll')
      }
      
      const res = await axios.get('/api/inbox/replies')
      setThreads(res.data)
      
      if (res.data.length > 0 && !activeThreadId) {
        setActiveThreadId(res.data[0].id)
      }
    } catch (err) {
      console.error('Failed to send reply:', err.response?.data || err.message)
      alert(`Error: ${err.response?.data?.error || err.message}`)
    } finally {
      setLoading(false)
      setPolling(false)
    }
  }

  const fetchMessages = async (threadId) => {
    try {
      // In this simple implementation, the "messages" are just the original draft + the reply event
      // To show a real conversation, we'd fetch all events/drafts for this lead
      const thread = threads.find(t => t.id === threadId)
      if (!thread) return

      const res = await axios.get(`/api/leads/${thread.lead_id._id || thread.lead_id.id}`)
      const lead = res.data
      
      // Get all drafts (sent & replies) and events for this lead
      const [draftsRes, eventsRes] = await Promise.all([
        axios.get(`/api/drafts?lead_id=${lead._id || lead.id}`),
        axios.get(`/api/campaigns/events?lead_id=${lead._id || lead.id}`)
      ])

      const allMessages = [
        ...draftsRes.data.map(d => ({
          id: d._id || d.id,
          type: d.is_reply ? 'reply' : 'outbound',
          body: d.body,
          subject: d.subject,
          date: d.created_at || d.sent_at,
          status: d.status
        })),
        ...eventsRes.data.filter(e => ['replied', 'sent', 'followup_sent'].includes(e.event_type)).map(e => {
          const meta = JSON.parse(e.metadata || '{}')
          const isFromLead = e.event_type === 'replied'
          return {
            id: e._id || e.id,
            type: isFromLead ? 'inbound' : 'outbound',
            body: meta.body_snippet || (isFromLead ? 'View reply in your email client' : 'Email sent'),
            subject: meta.subject || 'Follow-up',
            date: e.created_at,
            from: meta.from
          }
        })
      ]
      
      // Remove duplicates if an event and a draft refer to the same thing
      // (This can happen if we log both)
      const uniqueMessages = allMessages.reduce((acc, current) => {
        const x = acc.find(item => item.body === current.body && Math.abs(new Date(item.date) - new Date(current.date)) < 5000)
        if (!x) return acc.concat([current])
        else return acc
      }, []).sort((a, b) => new Date(a.date) - new Date(b.date))

      setMessages(uniqueMessages)
    } catch (err) {
      console.error('Failed to fetch messages:', err.response?.data || err.message)
    }
  }

  const handleSendReply = async () => {
    if (!replyText.trim() || !activeThread) return

    setSending(true)
    try {
      await axios.post('/api/inbox/reply', {
        lead_id: activeThread.lead_id._id || activeThread.lead_id.id,
        body: replyText
      })
      
      setReplyText('')
      fetchMessages(activeThreadId)
      alert('Reply sent successfully!')
    } catch (err) {
      console.error('Failed to send reply:', err.response?.data || err.message)
      alert(`Error: ${err.response?.data?.error || err.message}`)
    } finally {
      setSending(false)
    }
  }

  const filteredThreads = threads.filter(t => 
    t.lead_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.last_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading && !polling) {
    return (
      <div className="h-[calc(100vh-120px)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading your inbox...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-100">Inbox</h1>
          <p className="text-slate-400 mt-2">Manage your lead conversations</p>
        </div>
        <button
          onClick={() => fetchThreads(true)}
          disabled={polling}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
        >
          {polling ? <Loader2 size={18} className="animate-spin" /> : <RefreshCcw size={18} />}
          {polling ? 'Polling...' : 'Check for Replies'}
        </button>
      </div>

      {threads.length === 0 ? (
        <div className="flex-1 card flex flex-col items-center justify-center text-center p-12">
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
            <Mail size={40} className="text-slate-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">No replies yet</h2>
          <p className="text-slate-400 max-w-md mx-auto">
            Once your leads start replying to your campaigns, their messages will appear here. 
            Keep sending those emails!
          </p>
          <button 
            onClick={() => fetchThreads(true)}
            className="mt-8 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-xl transition-all"
          >
            Check for new replies
          </button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden gap-6">
          {/* Thread List */}
          <div className="w-80 flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {filteredThreads.map(thread => (
                <button
                  key={thread.id}
                  onClick={() => setActiveThreadId(thread.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    activeThreadId === thread.id
                      ? 'bg-indigo-500/10 border-indigo-500/50 shadow-lg shadow-indigo-500/5'
                      : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className={`font-bold truncate ${activeThreadId === thread.id ? 'text-indigo-400' : 'text-slate-100'}`}>
                      {thread.first_name} {thread.last_name}
                    </p>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap ml-2">
                      {thread.created_at || thread.date ? (
                        !isNaN(new Date(thread.created_at || thread.date).getTime()) 
                        ? formatDistanceToNow(new Date(thread.created_at || thread.date), { addSuffix: true })
                        : 'Recent'
                      ) : 'Recent'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mb-2">{thread.lead_email}</p>
                  <p className="text-sm text-slate-300 line-clamp-2 leading-relaxed italic">
                    "{thread.body_snippet || (thread.event_type === 'sent' ? 'Initial email sent' : 'Click to view conversation...')}"
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Chat Window */}
          <div className="flex-1 flex flex-col bg-slate-800/50 rounded-3xl border border-slate-700 overflow-hidden">
            {/* Chat Header */}
            <div className="p-6 border-b border-slate-700 bg-slate-800/30 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400 font-bold text-xl border border-indigo-500/20">
                  {activeThread?.first_name?.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">
                    {activeThread?.first_name} {activeThread?.last_name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Mail size={14} />
                    {activeThread?.lead_email}
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.type === 'inbound' ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[80%] group ${msg.type === 'inbound' ? 'items-start' : 'items-end'}`}>
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                        {msg.type === 'inbound' ? (activeThread?.first_name || 'Prospect') : 'You'}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        • {msg.date && !isNaN(new Date(msg.date).getTime()) 
                          ? new Date(msg.date).toLocaleString() 
                          : 'Recent'}
                      </span>
                    </div>
                    <div className={`p-4 rounded-2xl leading-relaxed whitespace-pre-wrap text-sm shadow-xl ${
                      msg.type === 'inbound'
                        ? 'bg-slate-700 text-slate-100 rounded-tl-none border border-slate-600'
                        : 'bg-indigo-600 text-white rounded-tr-none'
                    }`}>
                      {msg.type !== 'inbound' && (
                        <p className="text-[10px] opacity-70 font-bold uppercase mb-2 border-b border-white/10 pb-1">
                          Subject: {msg.subject}
                        </p>
                      )}
                      {msg.body}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Area */}
            <div className="p-6 border-t border-slate-700 bg-slate-800/30">
              <div className="relative">
                <textarea
                  placeholder={`Reply to ${activeThread?.first_name}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full p-4 pr-14 bg-slate-900 border border-slate-700 rounded-2xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all resize-none min-h-[100px]"
                />
                <button
                  onClick={handleSendReply}
                  disabled={sending || !replyText.trim()}
                  className="absolute bottom-4 right-4 p-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                >
                  {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-3 text-center uppercase tracking-widest font-bold">
                Press send to dispatch email via your active {activeThread?.provider || 'connected'} account
              </p>
            </div>
          </div>

          {/* Lead Info Sidebar */}
          <div className="w-80 flex flex-col gap-4">
            <div className="card bg-slate-800/30 border-slate-700 p-6">
              <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6">Lead Details</h4>
              
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-slate-700 rounded-lg text-slate-400">
                    <User size={18} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Full Name</p>
                    <p className="text-slate-200 font-medium">{activeThread?.first_name} {activeThread?.last_name}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-slate-700 rounded-lg text-slate-400">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Company</p>
                    <p className="text-slate-200 font-medium">{activeThread?.lead_id?.company || 'N/A'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-slate-700 rounded-lg text-slate-400">
                    <Briefcase size={18} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Title</p>
                    <p className="text-slate-200 font-medium">{activeThread?.lead_id?.title || 'N/A'}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <a 
                    href={activeThread?.lead_id?.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors text-slate-300 text-sm group"
                  >
                    View Website
                    <ExternalLink size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </a>
                </div>
              </div>
            </div>

            <div className="card bg-indigo-500/10 border-indigo-500/20 p-6">
              <div className="flex items-center gap-2 text-indigo-400 mb-3">
                <CheckCircle2 size={18} />
                <h4 className="text-sm font-bold uppercase tracking-widest">Status</h4>
              </div>
              <p className="text-2xl font-bold text-slate-100 mb-1 capitalize">Replied</p>
              <p className="text-xs text-indigo-300/70 leading-relaxed">
                Automated follow-ups have been paused for this lead.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
