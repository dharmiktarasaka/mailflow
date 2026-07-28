import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import LockScreen from './components/LockScreen'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import CampaignDetail from './pages/CampaignDetail'
import CampaignLeads from './pages/CampaignLeads'
import CampaignFollowups from './pages/CampaignFollowups'
import CampaignBuilder from './pages/CampaignBuilder'
import Drafts from './pages/Drafts'
import DraftReview from './pages/DraftReview'
import Followups from './pages/Followups'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import Inbox from './pages/Inbox'
import Settings from './pages/Settings'
import Setup from './pages/Setup'
import Connect from './pages/Connect'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')
  const [isVerified, setIsVerified] = useState(localStorage.getItem('mailflow_verified') === 'true')

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  // Show lock screen if not verified
  if (!isVerified) {
    return (
      <LockScreen
        onVerify={() => {
          localStorage.setItem('mailflow_verified', 'true')
          setIsVerified(true)
        }}
      />
    )
  }

  return (
    <Router>
      <div className="flex min-h-screen bg-transparent transition-colors duration-300">
        <Sidebar
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          theme={theme}
          setTheme={setTheme}
          onLock={() => {
            localStorage.removeItem('mailflow_verified')
            setIsVerified(false)
          }}
        />
        <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-0' : 'ml-0'}`}>
          <div className="container mx-auto p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/campaigns/new" element={<CampaignBuilder />} />
              <Route path="/campaigns/:id" element={<CampaignDetail />} />
              <Route path="/campaigns/:id/leads" element={<CampaignLeads />} />
              <Route path="/campaigns/:id/followups" element={<CampaignFollowups />} />
              <Route path="/drafts" element={<Drafts />} />
              <Route path="/drafts/:id" element={<DraftReview />} />
              <Route path="/followups" element={<Followups />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/leads/:id" element={<LeadDetail />} />
              
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/connect" element={<Connect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  )
}

export default App
