import { useEffect, useState } from 'react'
import axios from 'axios'

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLeads()
  }, [])

  async function fetchLeads() {
    try {
      const res = await axios.get('/api/leads')
      setLeads(res.data)
    } catch (err) {
      console.error('Failed to fetch leads:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-slate-300">Loading leads...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-slate-100">Leads</h1>
        <p className="text-slate-400 mt-2">Manage your contact database</p>
      </div>

      {leads.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 text-slate-400">Name</th>
                <th className="text-left py-3 px-4 text-slate-400">Email</th>
                <th className="text-left py-3 px-4 text-slate-400">Company</th>
                <th className="text-left py-3 px-4 text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                  <td className="p-4">{lead.first_name} {lead.last_name}</td>
                  <td className="p-4 text-slate-300">{lead.email}</td>
                  <td className="p-4 text-slate-300">{lead.company}</td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">
                      {lead.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center py-12 text-slate-400">No leads yet</div>
      )}
    </div>
  )
}
