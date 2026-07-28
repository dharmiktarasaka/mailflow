import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import axios from 'axios'
import { Loader2, Mail, Phone, MapPin, Briefcase, Linkedin, Globe } from 'lucide-react'

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lead, setLead] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchLead()
  }, [id])

  async function fetchLead() {
    try {
      setLoading(true)
      const res = await axios.get(`/api/leads/${id}`)
      setLead(res.data)
    } catch (err) {
      setError('Failed to load lead details')
      console.error('Error fetching lead:', err)
    } finally {
      setLoading(false)
    }
  }

  function goBack() {
    navigate(-1)
  }

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-[80vh] items-center justify-center text-red-400">
        {error}
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="flex h-[80vh] items-center justify-center text-slate-400">
        No lead found
      </div>
    )
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center gap-4">
        <button onClick={goBack} className="p-2 hover:bg-slate-700 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25L9 12l6.75 6.75" />
          </svg>
        </button>
        <h1 className="text-3xl font-bold text-slate-100">
          {lead.first_name} {lead.last_name}
        </h1>
      </div>

      <div className="grid gap-6">
        <div className="bg-slate-800 rounded-lg p-4">
          <h2 className="text-xl font-bold text-slate-100 mb-4">Contact Information</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail size={20} className="text-blue-400" />
              <div>
                <p className="text-slate-300 text-sm">Email</p>
                <p className="text-slate-100 font-medium">{lead.email}</p>
              </div>
            </div>
            {lead.linkedin_url && (
              <div className="flex items-center gap-3">
                <Linkedin size={20} className="text-blue-600" />
                <div>
                  <p className="text-slate-300 text-sm">LinkedIn Profile</p>
                  <a 
                    href={lead.linkedin_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-300 hover:underline"
                  >
                    View Profile
                  </a>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Phone size={20} className="text-green-400" />
              <div>
                <p className="text-slate-300 text-sm">Phone</p>
                <p className="text-slate-100 font-medium">Not Available</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4">
          <h2 className="text-xl font-bold text-slate-100 mb-4">Professional Information</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Briefcase size={20} className="text-indigo-400" />
              <div>
                <p className="text-slate-300 text-sm">Company</p>
                <p className="text-slate-100 font-medium">{lead.company || 'Not Provided'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Globe size={20} className="text-yellow-400" />
              <div>
                <p className="text-slate-300 text-sm">Website</p>
                {lead.website ? (
                  <a 
                    href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-300 hover:underline"
                  >
                    {lead.website}
                  </a>
                ) : (
                  <p className="text-slate-400">Not Provided</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin size={20} className="text-red-400" />
              <div>
                <p className="text-slate-300 text-sm">Location</p>
                <p className="text-slate-100 font-medium">Not Available</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Briefcase size={20} className="text-purple-400" />
              <div>
                <p className="text-slate-300 text-sm">Title</p>
                <p className="text-slate-100 font-medium">{lead.title || 'Not Provided'}</p>
              </div>
            </div>
          </div>
        </div>

        {lead.notes && (
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-xl font-bold text-slate-100 mb-4">Notes</h2>
            <p className="text-slate-300">{lead.notes}</p>
          </div>
        )}

        <div className="bg-slate-800 rounded-lg p-4">
          <h2 className="text-xl font-bold text-slate-100 mb-4">Campaign & Status</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              <div>
                <p className="text-slate-300 text-sm">Campaign</p>
                <p className="text-slate-100 font-medium">Campaign ID: {lead.campaign_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-slate-300 text-sm">Status</p>
                <span className={`px-2 py-1 rounded text-xs ${lead.status === 'new' ? 'bg-blue-500/20 text-blue-400' : lead.status === 'drafted' ? 'bg-yellow-500/20 text-yellow-400' : lead.status === 'sent' ? 'bg-green-500/20 text-green-400' : lead.status === 'replied' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-500/20 text-slate-400'}`}>
                  {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
