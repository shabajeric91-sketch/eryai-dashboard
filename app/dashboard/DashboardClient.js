'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function DashboardClient({ 
  user, 
  isSuperadmin, 
  customerId,
  customerName,
  initialSessions, 
  customers 
}) {
  const [sessions, setSessions] = useState(initialSessions)
  const [selectedSession, setSelectedSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [filterCustomer, setFilterCustomer] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    if (filterCustomer && session.customer_id !== filterCustomer) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const visitorId = session.visitor_id?.toLowerCase() || ''
      const customerName = session.customers?.name?.toLowerCase() || ''
      if (!visitorId.includes(query) && !customerName.includes(query)) return false
    }
    return true
  })

  // Load messages for selected session
  const loadMessages = async (sessionId) => {
    setLoadingMessages(true)
    try {
      const response = await fetch(`/api/messages?session_id=${sessionId}`)
      const data = await response.json()
      setMessages(data.messages || [])
    } catch (err) {
      console.error('Failed to load messages:', err)
    } finally {
      setLoadingMessages(false)
    }
  }

  const handleSelectSession = (session) => {
    setSelectedSession(session)
    loadMessages(session.id)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('sv-SE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status) => {
    const statusMap = {
      active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Aktiv' },
      ended: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Avslutad' },
      waiting: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Väntar' }
    }
    const s = statusMap[status] || statusMap.ended
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-eryai-600">EryAI</h1>
            {isSuperadmin ? (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                Superadmin
              </span>
            ) : (
              <span className="text-gray-500 text-sm">{customerName}</span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logga ut
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Sessions list */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border">
              {/* Filters */}
              <div className="p-4 border-b space-y-3">
                <h2 className="font-semibold text-gray-800">Konversationer</h2>
                
                {/* Search */}
                <input
                  type="text"
                  placeholder="Sök..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-eryai-500 focus:border-transparent"
                />

                {/* Customer filter (superadmin only) */}
                {isSuperadmin && customers.length > 0 && (
                  <select
                    value={filterCustomer}
                    onChange={(e) => setFilterCustomer(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-eryai-500 focus:border-transparent"
                  >
                    <option value="">Alla kunder</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Sessions */}
              <div className="max-h-[600px] overflow-y-auto">
                {filteredSessions.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <p>Inga konversationer ännu</p>
                  </div>
                ) : (
                  filteredSessions.map(session => (
                    <button
                      key={session.id}
                      onClick={() => handleSelectSession(session)}
                      className={`w-full p-4 text-left border-b hover:bg-gray-50 transition ${
                        selectedSession?.id === session.id ? 'bg-eryai-50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-800 truncate">
                          {session.visitor_id || 'Anonym besökare'}
                        </span>
                        {getStatusBadge(session.status)}
                      </div>
                      
                      {isSuperadmin && session.customers?.name && (
                        <p className="text-xs text-eryai-600 mb-1">
                          {session.customers.name}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{formatDate(session.updated_at)}</span>
                        <span>{session.message_count || 0} meddelanden</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Chat view */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border h-[700px] flex flex-col">
              {selectedSession ? (
                <>
                  {/* Chat header */}
                  <div className="p-4 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-800">
                          {selectedSession.visitor_id || 'Anonym besökare'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Startad {formatDate(selectedSession.session_start)}
                        </p>
                      </div>
                      {getStatusBadge(selectedSession.status)}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-eryai-600"></div>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        Inga meddelanden
                      </div>
                    ) : (
                      messages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={
                              msg.role === 'user'
                                ? 'chat-bubble-user'
                                : 'chat-bubble-assistant'
                            }
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <p className={`text-xs mt-1 ${
                              msg.role === 'user' ? 'text-eryai-200' : 'text-gray-400'
                            }`}>
                              {formatDate(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p>Välj en konversation för att se chatten</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
