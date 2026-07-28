import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Grid3x3, Megaphone, Mail, Users, Inbox, Settings, ChevronRight, Menu, X, RotateCcw, Sun, Moon, Lock } from 'lucide-react'
import axios from 'axios'

export default function Sidebar({ isOpen, setIsOpen, theme, setTheme, onLock }) {
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUser()
  }, [])

  // Refetch user when location changes or when returning from OAuth
  useEffect(() => {
    fetchUser()
  }, [location.pathname])

  // Background polling for replies to make the app feel instant
  useEffect(() => {
    const pollInterval = setInterval(() => {
      axios.post('/api/inbox/poll').catch(() => {})
    }, 10000)
    return () => clearInterval(pollInterval)
  }, [])

  async function fetchUser() {
    try {
      const res = await axios.get('/auth/user')
      if (res.data.loggedIn === false) {
        setUser(null)
      } else {
        setUser(res.data)
      }
    } catch (err) {
      console.error('Failed to fetch user:', err)
    } finally {
      setLoading(false)
    }
  }

const menuItems = [
    { path: '/', label: 'Dashboard', icon: Grid3x3 },
    { path: '/campaigns', label: 'Campaigns', icon: Megaphone },
    { path: '/drafts', label: 'Drafts', icon: Mail },
    { path: '/followups', label: 'Follow-ups', icon: RotateCcw },
    { path: '/leads', label: 'Leads', icon: Users },
    { path: '/inbox', label: 'Inbox', icon: Inbox },
    { path: '/settings', label: 'Settings', icon: Settings },
]

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <>
      <div
        className={`fixed left-0 top-0 h-screen bg-white dark:bg-[#0B0F19] border-r border-slate-200 dark:border-slate-800 transition-all duration-300 z-50 ${
          isOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Logo & User Profile */}
        <div className="h-20 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
          {isOpen ? (
            user ? (
              // Show connected account
              <Link to="/settings" className="flex items-center gap-2 flex-1 hover:opacity-80">
                {user.avatar_url && (
                  <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{user.display_name || user.email}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate capitalize">{user.provider}</p>
                </div>
              </Link>
            ) : (
              // Not connected
              <Link to="/settings" className="text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition">
                Connect Email
              </Link>
            )
          ) : null}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex-shrink-0"
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Menu Items */}
        <nav className="mt-8 px-3 space-y-2">
          {menuItems.map(item => {
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all ${
                  isActive(item.path)
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <Icon size={20} className="flex-shrink-0" />
                {isOpen && (
                  <div className="flex-1 flex items-center justify-between">
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        {isOpen && (
          <div className="absolute bottom-4 left-4 right-4 space-y-2">
            <button
              onClick={onLock}
              className="w-full flex items-center justify-between p-3 bg-white dark:bg-[#131A2B] border border-slate-200 dark:border-slate-700/50 rounded-lg hover:shadow-md transition-all group"
            >
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Lock System
              </span>
              <Lock size={18} className="text-rose-500 group-hover:text-rose-400" />
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-full flex items-center justify-between p-3 bg-white dark:bg-[#131A2B] border border-slate-200 dark:border-slate-700/50 rounded-lg hover:shadow-md transition-all group"
            >
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </span>
              {theme === 'dark' ? (
                <Moon size={18} className="text-indigo-400 group-hover:text-indigo-300" />
              ) : (
                <Sun size={18} className="text-amber-500 group-hover:text-amber-600" />
              )}
            </button>
            <div className="p-3 bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700/50 rounded-lg text-xs text-slate-500 dark:text-slate-400">
              <p className="font-medium text-slate-700 dark:text-slate-300">MailFlow v1.0</p>
              <p className="mt-1">AI Email Outreach</p>
            </div>
          </div>
        )}
      </div>

      {/* Content offset */}
      <div className={`transition-all duration-300 ${isOpen ? 'ml-64' : 'ml-20'}`}></div>
    </>
  )
}
