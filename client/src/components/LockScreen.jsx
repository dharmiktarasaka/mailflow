import { useState } from 'react'
import { Lock, Unlock, Eye, EyeOff, AlertCircle } from 'lucide-react'

export default function LockScreen({ onVerify }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (password === 'mailmation') {
      setIsUnlocking(true)
      setError('')
      setTimeout(() => {
        onVerify()
      }, 600) // smooth transition delay
    } else {
      setError('Incorrect password. Please try again.')
      setPassword('')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] flex items-center justify-center p-4 transition-colors duration-300">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-white dark:bg-[#131A2B] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8 relative overflow-hidden transition-all duration-300">
        
        {/* Top Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 ${
            isUnlocking 
              ? 'bg-emerald-500/10 text-emerald-500 scale-110' 
              : error 
              ? 'bg-rose-500/10 text-rose-500 animate-shake' 
              : 'bg-indigo-500/10 text-indigo-500'
          }`}>
            {isUnlocking ? <Unlock size={28} /> : <Lock size={28} />}
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900 dark:text-slate-100">
            System Locked
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Please enter your password to access MailFlow
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password..."
              className={`w-full px-4 py-3 bg-slate-50 dark:bg-[#0B0F19]/50 border rounded-xl outline-none transition-all duration-300 text-slate-900 dark:text-slate-100 pr-12 text-center font-medium tracking-wide ${
                error 
                  ? 'border-rose-500/50 focus:border-rose-500 focus:ring-1 focus:ring-rose-500' 
                  : 'border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
              }`}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-sm animate-fade-in">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!password || isUnlocking}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/25 flex items-center justify-center gap-2"
          >
            {isUnlocking ? 'Unlocking...' : 'Unlock Dashboard'}
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
          MailFlow AI outreach assistant
        </div>
      </div>
    </div>
  )
}
