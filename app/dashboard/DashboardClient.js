'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import PushNotificationSettings from '@/app/components/PushNotificationSettings'
import AdminSettings from '@/app/components/AdminSettings'

export default function DashboardClient({ 
  user, 
  isSuperadmin, 
  customers, 
  initialSessions, 
  initialCustomerId,
  teamMembers = [],
  customerPlan = 'starter',
  userRole = 'member',
  customerLogo = null
}) {
  const [sessions, setSessions] = useState(initialSessions)
  const [selectedSession, setSelectedSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId)
  const [activeView, setActiveView] = useState('chats') // 'chats' | 'notifications' | 'admin'
  const [showOnlyUnread, setShowOnlyUnread] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assigningSession, setAssigningSession] = useState(null)
  
  const router = useRouter()
  const supabase = createClient()

  // Get current customer info
  const currentCustomer = customers.find(c => c.id === selectedCustomerId) || customers[0]
  const customerName = currentCustomer?.name || 'Dashboard'
  const currentCustomerLogo = currentCustomer?.logo_url || customerLogo

  // Check admin access
  const canAccessAdmin = isSuperadmin || userRole === 'admin' || userRole === 'owner'

  // Filtered sessions
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = searchQuery === '' || 
      (session.guest_name || 'Anonym besökare').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (session.customer?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCustomer = !selectedCustomerId || session.customer_id === selectedCustomerId
    const matchesUnread = !showOnlyUnread || !session.is_read
    
    return matchesSearch && matchesCustomer && matchesUnread
  })

  // Count unread
  const unreadCount = sessions.filter(s => !s.is_read && (!selectedCustomerId || s.customer_id === selectedCustomerId)).length

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-sessions')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_sessions'
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setSessions(prev => [{ ...payload.new, is_read: false }, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setSessions(prev => prev.map(s => 
            s.id === payload.new.id ? { ...s, ...payload.new } : s
          ))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // Fetch messages when session selected
  useEffect(() => {
    if (selectedSession) {
      fetchMessages(selectedSession.id)
      // Mark as read
      markAsRead(selectedSession.id)
    }
  }, [selectedSession])

  const fetchMessages = async (sessionId) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/messages?sessionId=${sessionId}`)
      const data = await res.json()
      if (data.messages) {
        setMessages(data.messages)
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
    setLoading(false)
  }

  const markAsRead = async (sessionId) => {
    try {
      await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'markAsRead' })
      })
      setSessions(prev => prev.map(s => 
        s.id === sessionId ? { ...s, is_read: true } : s
      ))
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  const markAsUnread = async (sessionId) => {
    try {
      await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'markAsUnread' })
      })
      setSessions(prev => prev.map(s => 
        s.id === sessionId ? { ...s, is_read: false } : s
      ))
      setOpenMenuId(null)
    } catch (error) {
      console.error('Error marking as unread:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const sessionIds = filteredSessions.filter(s => !s.is_read).map(s => s.id)
      if (sessionIds.length === 0) return
      
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markAllAsRead', sessionIds })
      })
      setSessions(prev => prev.map(s => 
        sessionIds.includes(s.id) ? { ...s, is_read: true } : s
      ))
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const deleteSession = async (sessionId) => {
    if (!confirm('Är du säker på att du vill radera denna chatt?')) return
    
    try {
      await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'delete' })
      })
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null)
        setMessages([])
      }
      setOpenMenuId(null)
    } catch (error) {
      console.error('Error deleting session:', error)
    }
  }

  const assignSession = async (sessionId, assigneeId, assigneeType) => {
    try {
      await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId, 
          action: 'assign',
          assigneeId,
          assigneeType
        })
      })
      setSessions(prev => prev.map(s => 
        s.id === sessionId ? { ...s, assigned_to: assigneeId, assigned_type: assigneeType } : s
      ))
      setShowAssignModal(false)
      setAssigningSession(null)
    } catch (error) {
      console.error('Error assigning session:', error)
    }
  }

  const sendReply = async () => {
    if (!replyText.trim() || !selectedSession) return
    
    setSending(true)
    try {
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSession.id,
          message: replyText,
          staffName: user.email.split('@')[0]
        })
      })
      
      if (res.ok) {
        setReplyText('')
        fetchMessages(selectedSession.id)
      }
    } catch (error) {
      console.error('Error sending reply:', error)
    }
    setSending(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'Just nu'
    if (diffMins < 60) return `${diffMins}m sedan`
    if (diffHours < 24) return `${diffHours}h sedan`
    if (diffDays < 7) return `${diffDays}d sedan`
    return date.toLocaleDateString('sv-SE')
  }

  const isActive = (session) => {
    const lastActivity = new Date(session.updated_at || session.created_at)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    return lastActivity > fiveMinutesAgo
  }

  // Get assignee name
  const getAssigneeName = (session) => {
    if (!session.assigned_to) return null
    const member = teamMembers.find(m => m.id === session.assigned_to)
    return member?.name || member?.email?.split('@')[0] || 'Tilldelad'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left: Logo + Customer branding */}
            <div className="flex items-center gap-3">
              {/* EryAI Logo */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-purple-200">
                  E
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">EryAI</h1>
                  <p className="text-xs text-gray-500">Dashboard</p>
                </div>
              </div>
              
              {/* Divider + Customer branding */}
              {currentCustomer && (
                <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200">
                  {currentCustomerLogo ? (
                    <img 
                      src={currentCustomerLogo} 
                      alt={customerName} 
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm ring-2 ring-white">
                      {customerName.charAt(0)}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">{customerName}</span>
                </div>
              )}
            </div>

            {/* Center: Navigation */}
            <nav className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setActiveView('chats')}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeView === 'chats' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>💬</span> Chattar
              </button>
              <button
                onClick={() => setActiveView('notifications')}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeView === 'notifications' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>🔔</span> Notiser
              </button>
              {canAccessAdmin && (
                <button
                  onClick={() => setActiveView('admin')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    activeView === 'admin' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>⚙️</span> Admin
                </button>
              )}
            </nav>

            {/* Right: Status + User */}
            <div className="flex items-center gap-4">
              {unreadCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-sm font-medium text-red-700">{unreadCount} väntar</span>
                </div>
              )}
              
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white font-semibold text-sm">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{user.email}</p>
                  <p className="text-xs text-gray-500">{isSuperadmin ? 'Superadmin' : userRole}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Logga ut"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeView === 'chats' && (
          <div className="flex gap-6 h-[calc(100vh-140px)]">
            {/* Sidebar - Session List */}
            <div className="w-80 flex-shrink-0 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col">
              {/* Sidebar Header */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">Konversationer</h2>
                  <span className="text-sm text-gray-500">{filteredSessions.length} st</span>
                </div>
                
                {/* Search */}
                <div className="relative mb-3">
                  <input
                    type="text"
                    placeholder="Sök..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowOnlyUnread(!showOnlyUnread)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      showOnlyUnread 
                        ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Olästa
                  </button>
                  
                  {/* Customer filter for superadmin/multi-customer users */}
                  {customers.length > 1 && (
                    <select
                      value={selectedCustomerId || ''}
                      onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                      className="flex-1 px-3 py-1.5 bg-gray-100 border-0 rounded-lg text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Alla</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Mark all as read */}
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="w-full mt-3 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 transition-colors"
                  >
                    ✓ Markera alla som lästa
                  </button>
                )}
              </div>

              {/* Session List */}
              <div className="flex-1 overflow-y-auto p-2">
                {filteredSessions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">Inga konversationer</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredSessions.map((session) => (
                      <div
                        key={session.id}
                        className={`relative group p-3 rounded-xl cursor-pointer transition-all ${
                          selectedSession?.id === session.id
                            ? 'bg-purple-50 border border-purple-200'
                            : 'hover:bg-gray-50 border border-transparent'
                        }`}
                        onClick={() => setSelectedSession(session)}
                      >
                        <div className="flex items-start gap-3">
                          {/* Unread indicator */}
                          {!session.is_read && (
                            <span className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full"></span>
                          )}
                          
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 font-medium flex-shrink-0">
                            {(session.guest_name || 'A').charAt(0).toUpperCase()}
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-900 truncate">
                                {session.guest_name || 'Anonym besökare'}
                              </span>
                              {isActive(session) && (
                                <span className="flex-shrink-0 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                  ● Aktiv
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-purple-600 font-medium truncate">
                              {session.customer?.name || customerName}
                            </p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-gray-500">
                                {formatTime(session.updated_at || session.created_at)}
                              </span>
                              <span className="text-xs text-gray-400">
                                {session.message_count || 0} meddelanden
                              </span>
                            </div>
                            {/* Assigned badge */}
                            {session.assigned_to && (
                              <div className="mt-1.5 flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full w-fit">
                                <span>👤</span>
                                <span>{getAssigneeName(session)}</span>
                              </div>
                            )}
                          </div>

                          {/* Three-dot menu */}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMenuId(openMenuId === session.id ? null : session.id)
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-200 rounded-lg transition-all"
                            >
                              <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="5" r="2"/>
                                <circle cx="12" cy="12" r="2"/>
                                <circle cx="12" cy="19" r="2"/>
                              </svg>
                            </button>
                            
                            {/* Dropdown menu */}
                            {openMenuId === session.id && (
                              <div className="absolute right-0 top-8 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-10">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    session.is_read ? markAsUnread(session.id) : markAsRead(session.id)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                  {session.is_read ? '○ Markera som oläst' : '✓ Markera som läst'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setAssigningSession(session)
                                    setShowAssignModal(true)
                                    setOpenMenuId(null)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                  👥 Tilldela / Eskalera
                                </button>
                                <hr className="my-1 border-gray-100" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteSession(session.id)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                >
                                  🗑️ Radera
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Chat View */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col">
              {selectedSession ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 font-medium">
                        {(selectedSession.guest_name || 'A').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {selectedSession.guest_name || 'Anonym besökare'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {selectedSession.guest_email || 'Ingen email'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setAssigningSession(selectedSession)
                          setShowAssignModal(true)
                        }}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                      >
                        👥 Tilldela
                      </button>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p>Inga meddelanden än</p>
                      </div>
                    ) : (
                      messages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                              msg.role === 'user'
                                ? 'bg-gray-100 text-gray-900'
                                : msg.role === 'staff'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-purple-600 text-white'
                            }`}
                          >
                            {msg.role === 'staff' && (
                              <p className="text-xs font-medium mb-1 opacity-75">
                                {msg.staff_name || 'Personal'}
                              </p>
                            )}
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            <p className={`text-xs mt-1 ${
                              msg.role === 'user' ? 'text-gray-500' : 
                              msg.role === 'staff' ? 'text-amber-700' : 'text-purple-200'
                            }`}>
                              {formatTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Reply Input */}
                  <div className="p-4 border-t border-gray-100">
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                        placeholder="Skriv ett svar..."
                        className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <button
                        onClick={sendReply}
                        disabled={sending || !replyText.trim()}
                        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
                      >
                        {sending ? '...' : 'Skicka'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-1">Välj en konversation</h3>
                    <p className="text-sm">Klicka på en chatt i listan för att se meddelanden</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'notifications' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Push-notiser</h2>
            <PushNotificationSettings customerId={selectedCustomerId || initialCustomerId} />
          </div>
        )}

        {activeView === 'admin' && canAccessAdmin && (
          <AdminSettings 
            customerId={selectedCustomerId || initialCustomerId}
            customerName={customerName}
            currentUserRole={userRole}
            plan={customerPlan}
          />
        )}
      </main>

      {/* Assign Modal */}
      {showAssignModal && assigningSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Tilldela konversation</h3>
              <p className="text-sm text-gray-500 mt-1">
                Välj vem som ska hantera denna chatt
              </p>
            </div>
            
            <div className="p-4 max-h-80 overflow-y-auto">
              {teamMembers.length === 0 ? (
                <p className="text-center text-gray-500 py-4">
                  Inga teammedlemmar hittades
                </p>
              ) : (
                <div className="space-y-2">
                  {/* Unassign option */}
                  <button
                    onClick={() => assignSession(assigningSession.id, null, null)}
                    className="w-full p-3 text-left hover:bg-gray-50 rounded-xl transition-colors flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Ta bort tilldelning</p>
                      <p className="text-sm text-gray-500">Ingen specifik ansvarig</p>
                    </div>
                  </button>
                  
                  <hr className="my-2" />
                  
                  {teamMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => assignSession(assigningSession.id, member.id, 'user')}
                      className={`w-full p-3 text-left hover:bg-gray-50 rounded-xl transition-colors flex items-center gap-3 ${
                        assigningSession.assigned_to === member.id ? 'bg-purple-50 border border-purple-200' : ''
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-medium">
                        {(member.name || member.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {member.name || member.email?.split('@')[0]}
                        </p>
                        <p className="text-sm text-gray-500">{member.role || 'Medlem'}</p>
                      </div>
                      {assigningSession.assigned_to === member.id && (
                        <span className="ml-auto text-purple-600">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => {
                  setShowAssignModal(false)
                  setAssigningSession(null)
                }}
                className="w-full py-2.5 bg-gray-200 hover:bg-gray-300 rounded-xl font-medium text-gray-700 transition-colors"
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menu */}
      {openMenuId && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setOpenMenuId(null)}
        />
      )}
    </div>
  )
}
