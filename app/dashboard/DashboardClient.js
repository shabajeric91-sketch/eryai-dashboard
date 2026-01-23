'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import PushNotificationSettings from '@/app/components/PushNotificationSettings'

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
  const [showSettings, setShowSettings] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Show filter if user has access to multiple customers
  const showCustomerFilter = customers && customers.length > 1

  // Hjälpfunktion för att hämta gästnamn
  const getGuestDisplayName = (session) => {
    if (session.metadata?.guest_name) {
      return session.metadata.guest_name
    }
    if (session.visitor_id && !session.visitor_id.startsWith('visitor_')) {
      return session.visitor_id
    }
    return 'Anonym besökare'
  }

  // Hjälpfunktion för att hämta gästkontakt
  const getGuestContact = (session) => {
    return session.metadata?.guest_email || session.metadata?.guest_phone || null
  }

  // Hämta customer name från customers array
  const getCustomerName = (customerId) => {
    const customer = customers?.find(c => c.id === customerId)
    return customer?.name || null
  }

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    if (filterCustomer && session.customer_id !== filterCustomer) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const guestName = getGuestDisplayName(session).toLowerCase()
      const guestEmail = session.metadata?.guest_email?.toLowerCase() || ''
      const guestPhone = session.metadata?.guest_phone || ''
      const custName = getCustomerName(session.customer_id)?.toLowerCase() || ''
      
      if (!guestName.includes(query) && 
          !guestEmail.includes(query) && 
          !guestPhone.includes(query) &&
          !custName.includes(query)) {
        return false
      }
    }
    return true
  })

  // Stats
  const needsResponseCount = sessions.filter(s => s.needs_human).length
  const activeCount = sessions.filter(s => s.status === 'active').length

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

  const handleOpenFullChat = (sessionId) => {
    router.push(`/chat/${sessionId}`)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just nu'
    if (diffMins < 60) return `${diffMins} min sedan`
    if (diffHours < 24) return `${diffHours}h sedan`
    if (diffDays < 7) return `${diffDays}d sedan`
    
    return date.toLocaleDateString('sv-SE', {
      month: 'short',
      day: 'numeric'
    })
  }

  const formatFullDate = (dateString) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString('sv-SE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (session) => {
    if (session.needs_human) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-sm">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
          Behöver svar
        </span>
      )
    }
    
    if (session.status === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
          Aktiv
        </span>
      )
    }
    
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        Avslutad
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/60 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo & Role */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-200">
                  <span className="text-white font-bold text-lg">E</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                    EryAI
                  </h1>
                  <p className="text-xs text-slate-500">Dashboard</p>
                </div>
              </div>
              
              {isSuperadmin ? (
                <span className="px-3 py-1.5 bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700 text-xs font-semibold rounded-full border border-violet-200">
                  ⚡ Superadmin
                </span>
              ) : customerName ? (
                <span className="px-3 py-1.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-full">
                  {customerName}
                </span>
              ) : null}
            </div>

            {/* Stats */}
            <div className="hidden md:flex items-center gap-6">
              {needsResponseCount > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 rounded-xl border border-red-100">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-sm font-semibold text-red-700">{needsResponseCount}</span>
                  <span className="text-sm text-red-600">behöver svar</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{activeCount}</span>
                <span>aktiva chattar</span>
              </div>
            </div>
            
            {/* User menu */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2.5 rounded-xl transition-all ${
                  showSettings 
                    ? 'bg-violet-100 text-violet-600' 
                    : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                }`}
                title="Inställningar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              
              <div className="h-8 w-px bg-slate-200"></div>
              
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-slate-200 to-slate-300 rounded-full flex items-center justify-center">
                  <span className="text-slate-600 font-medium text-sm">
                    {user.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-slate-700">{user.email}</p>
                </div>
              </div>
              
              <button
                onClick={handleLogout}
                className="p-2.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl transition-all"
                title="Logga ut"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/60 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Inställningar</h2>
                <p className="text-sm text-slate-500">Hantera notifikationer och preferenser</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <PushNotificationSettings userId={user.id} customerId={customerId} />
          </div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Sessions list */}
          <div className="lg:col-span-4 xl:col-span-3">
            <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/60 overflow-hidden">
              {/* Filters */}
              <div className="p-4 border-b border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-800">Konversationer</h2>
                  <span className="text-xs text-slate-400">{filteredSessions.length} st</span>
                </div>
                
                {/* Search */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Sök namn, email, telefon..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-0 rounded-xl text-sm placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all"
                  />
                </div>

                {/* Customer filter - show for anyone with multiple customers */}
                {showCustomerFilter && (
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <select
                      value={filterCustomer}
                      onChange={(e) => setFilterCustomer(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-0 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Alla verksamheter</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Sessions */}
              <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                {filteredSessions.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-slate-500 font-medium">Inga konversationer</p>
                    <p className="text-sm text-slate-400 mt-1">Chattar visas här när de kommer in</p>
                  </div>
                ) : (
                  filteredSessions.map(session => {
                    const guestName = getGuestDisplayName(session)
                    const guestContact = getGuestContact(session)
                    const custName = getCustomerName(session.customer_id)
                    const isSelected = selectedSession?.id === session.id
                    
                    return (
                      <button
                        key={session.id}
                        onClick={() => handleSelectSession(session)}
                        className={`w-full p-4 text-left border-b border-slate-100 transition-all ${
                          isSelected 
                            ? 'bg-gradient-to-r from-violet-50 to-indigo-50 border-l-4 border-l-violet-500' 
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              session.needs_human 
                                ? 'bg-gradient-to-br from-red-400 to-orange-400' 
                                : 'bg-gradient-to-br from-slate-200 to-slate-300'
                            }`}>
                              <span className={`text-xs font-semibold ${
                                session.needs_human ? 'text-white' : 'text-slate-600'
                              }`}>
                                {guestName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium text-slate-800 truncate">
                              {guestName}
                            </span>
                          </div>
                          {getStatusBadge(session)}
                        </div>
                        
                        {guestContact && (
                          <p className="text-xs text-slate-500 truncate mb-1 ml-10">
                            {guestContact}
                          </p>
                        )}
                        
                        {showCustomerFilter && custName && (
                          <p className="text-xs font-medium text-violet-600 mb-1 ml-10">
                            {custName}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-between text-xs text-slate-400 ml-10">
                          <span>{formatDate(session.updated_at)}</span>
                          <span>{session.message_count || 0} meddelanden</span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Chat view */}
          <div className="lg:col-span-8 xl:col-span-9">
            <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/60 h-[calc(100vh-180px)] flex flex-col overflow-hidden">
              {selectedSession ? (
                <>
                  {/* Chat header */}
                  <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          selectedSession.needs_human 
                            ? 'bg-gradient-to-br from-red-400 to-orange-400' 
                            : 'bg-gradient-to-br from-violet-400 to-indigo-400'
                        }`}>
                          <span className="text-white font-bold text-lg">
                            {getGuestDisplayName(selectedSession).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800 text-lg">
                            {getGuestDisplayName(selectedSession)}
                          </h3>
                          <div className="flex items-center gap-3 text-sm">
                            {getGuestContact(selectedSession) && (
                              <span className="text-slate-600">
                                {getGuestContact(selectedSession)}
                              </span>
                            )}
                            <span className="text-slate-400">•</span>
                            <span className="text-slate-400">
                              Startad {formatFullDate(selectedSession.session_start)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(selectedSession)}
                        <button
                          onClick={() => handleOpenFullChat(selectedSession.id)}
                          className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium rounded-xl hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-violet-200"
                        >
                          Öppna fullvy →
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-slate-50/50 to-white">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-10 h-10 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
                          <span className="text-sm text-slate-500">Laddar meddelanden...</span>
                        </div>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-slate-500">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </div>
                          <p className="font-medium">Inga meddelanden ännu</p>
                        </div>
                      </div>
                    ) : (
                      messages.map((msg, idx) => {
                        const isUser = msg.role === 'user'
                        const isHuman = msg.sender_type === 'human'
                        
                        return (
                          <div
                            key={idx}
                            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[70%] rounded-2xl px-5 py-3 shadow-sm ${
                                isUser
                                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                                  : isHuman
                                  ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 text-slate-800'
                                  : 'bg-white border border-slate-200 text-slate-800'
                              }`}
                            >
                              {!isUser && (
                                <p className={`text-xs font-semibold mb-1.5 ${
                                  isHuman ? 'text-emerald-600' : 'text-violet-600'
                                }`}>
                                  {isHuman ? '👤 Personal' : '🤖 AI-assistent'}
                                </p>
                              )}
                              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                              <p className={`text-xs mt-2 ${
                                isUser ? 'text-violet-200' : 'text-slate-400'
                              }`}>
                                {formatFullDate(msg.created_at)}
                              </p>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  {selectedSession.needs_human && (
                    <div className="p-4 border-t border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                            <span className="text-xl">⚡</span>
                          </div>
                          <div>
                            <p className="font-medium text-amber-800">Kunden väntar på svar</p>
                            <p className="text-sm text-amber-600">Klicka för att svara direkt</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleOpenFullChat(selectedSession.id)}
                          className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-200"
                        >
                          Svara nu →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-slate-100 to-slate-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
                      <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-slate-700 mb-2">Välj en konversation</h3>
                    <p className="text-slate-500">Klicka på en chatt i listan för att se meddelanden</p>
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
