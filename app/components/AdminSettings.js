'use client'

import { useState, useEffect } from 'react'

// Plan limits
const PLAN_LIMITS = {
  starter: { users: 3, name: 'Starter', price: '299 kr/mån' },
  pro: { users: 10, name: 'Pro', price: '499 kr/mån' },
  enterprise: { users: 999, name: 'Enterprise', price: 'Kontakta oss' }
}

// Available roles
const ROLES = [
  { value: 'admin', label: 'Admin', description: 'Full tillgång, kan hantera användare' },
  { value: 'manager', label: 'Manager', description: 'Se alla chattar, hantera team' },
  { value: 'member', label: 'Medlem', description: 'Se teamets chattar' },
  { value: 'viewer', label: 'Läsare', description: 'Endast läsa chattar' }
]

export default function AdminSettings({ 
  customerId, 
  customerName,
  currentUserRole,
  plan = 'starter'
}) {
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteTeam, setInviteTeam] = useState('')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [activeTab, setActiveTab] = useState('users')
  
  // New team form
  const [newTeamName, setNewTeamName] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)
  
  const planLimit = PLAN_LIMITS[plan] || PLAN_LIMITS.starter
  const canAddUsers = users.filter(u => !u.is_invite).length < planLimit.users
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'owner'

  useEffect(() => {
    if (customerId) {
      fetchUsers()
      fetchTeams()
    }
  }, [customerId])

  const fetchUsers = async () => {
    try {
      const response = await fetch(`/api/admin/users?customer_id=${customerId}`)
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setUsers(data.users || [])
    } catch (err) {
      console.error('Failed to fetch users:', err)
      setError('Kunde inte hämta användare')
    } finally {
      setLoading(false)
    }
  }

  const fetchTeams = async () => {
    try {
      const response = await fetch(`/api/admin/teams?customer_id=${customerId}`)
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setTeams(data.teams || [])
    } catch (err) {
      console.error('Failed to fetch teams:', err)
    }
  }

  const handleInviteUser = async (e) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    if (!canAddUsers) {
      setError(`Du har nått gränsen på ${planLimit.users} användare för ${planLimit.name}-planen.`)
      return
    }

    setInviting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          team_id: inviteTeam || null
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setSuccess(data.message || `Inbjudan skickad till ${inviteEmail}`)
      setInviteEmail('')
      setInviteRole('member')
      setInviteTeam('')
      fetchUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setInviting(false)
    }
  }

  const handleUpdateRole = async (userId, newRole) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          user_id: userId,
          role: newRole
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setUsers(prev => prev.map(u => 
        u.user_id === userId ? { ...u, role: newRole } : u
      ))
      setEditingUser(null)
      setSuccess('Roll uppdaterad')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemoveUser = async (userId, isInvite = false) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          user_id: userId,
          is_invite: isInvite
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setUsers(prev => prev.filter(u => u.user_id !== userId))
      setShowDeleteConfirm(null)
      setSuccess(isInvite ? 'Inbjudan borttagen' : 'Användare borttagen')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateTeam = async (e) => {
    e.preventDefault()
    if (!newTeamName.trim()) return

    setCreatingTeam(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          name: newTeamName.trim()
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setNewTeamName('')
      fetchTeams()
      setSuccess('Team skapat')
    } catch (err) {
      setError(err.message)
    } finally {
      setCreatingTeam(false)
    }
  }

  const handleDeleteTeam = async (teamId) => {
    if (!confirm('Är du säker på att du vill radera detta team?')) return
    
    try {
      const response = await fetch('/api/admin/teams', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          team_id: teamId
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      fetchTeams()
      setSuccess('Team borttaget')
    } catch (err) {
      setError(err.message)
    }
  }

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null)
        setSuccess(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-700">Åtkomst nekad</h3>
        <p className="text-slate-500 mt-2">Du behöver admin-behörighet för att hantera användare.</p>
      </div>
    )
  }

  const activeUsers = users.filter(u => !u.is_invite)
  const pendingInvites = users.filter(u => u.is_invite)

  return (
    <div className="space-y-6">
      {/* Header with plan info */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Inställningar</h2>
          <p className="text-sm text-slate-500">{customerName}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-gradient-to-r from-violet-100 to-purple-100 rounded-xl border border-violet-200">
            <p className="text-xs text-violet-600 font-medium">{planLimit.name}</p>
            <p className="text-sm font-bold text-violet-800">
              {activeUsers.length} / {planLimit.users} användare
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'users'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          👤 Användare ({activeUsers.length})
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'teams'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          👥 Team ({teams.length})
        </button>
        <button
          onClick={() => setActiveTab('plan')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'plan'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          💎 Plan
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <span className="text-red-500">⚠️</span>
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
          <span className="text-emerald-500">✓</span>
          <p className="text-sm text-emerald-700">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">✕</button>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Invite Form */}
          <div className="p-5 bg-gradient-to-r from-slate-50 to-white rounded-2xl border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Bjud in ny användare</h3>
            <form onSubmit={handleInviteUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="kollega@foretag.se"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Roll</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    {ROLES.map(role => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Team (valfritt)</label>
                  <select
                    value={inviteTeam}
                    onChange={(e) => setInviteTeam(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    <option value="">Inget team</option>
                    {teams.map(team => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {canAddUsers 
                    ? `Du kan lägga till ${planLimit.users - activeUsers.length} fler användare`
                    : `Uppgradera för fler användare`
                  }
                </p>
                <button
                  type="submit"
                  disabled={inviting || !canAddUsers}
                  className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium rounded-xl hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-200"
                >
                  {inviting ? 'Skickar...' : 'Bjud in'}
                </button>
              </div>
            </form>
          </div>

          {/* Users List */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Aktiva användare ({activeUsers.length})</h3>
            </div>
            
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-slate-500 mt-3">Laddar...</p>
              </div>
            ) : activeUsers.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-slate-500">Inga användare ännu</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeUsers.map(user => (
                  <div key={user.user_id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          user.role === 'admin' || user.role === 'owner'
                            ? 'bg-gradient-to-br from-violet-400 to-indigo-400'
                            : 'bg-gradient-to-br from-slate-200 to-slate-300'
                        }`}>
                          <span className={`text-sm font-semibold ${
                            user.role === 'admin' || user.role === 'owner' ? 'text-white' : 'text-slate-600'
                          }`}>
                            {user.email?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{user.email}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              user.role === 'admin' || user.role === 'owner'
                                ? 'bg-violet-100 text-violet-700'
                                : user.role === 'manager'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {ROLES.find(r => r.value === user.role)?.label || user.role}
                            </span>
                            {user.team_name && (
                              <span className="text-xs text-slate-500">• {user.team_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {editingUser === user.user_id ? (
                          <div className="flex items-center gap-2">
                            <select
                              defaultValue={user.role}
                              onChange={(e) => handleUpdateRole(user.user_id, e.target.value)}
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm"
                            >
                              {ROLES.map(role => (
                                <option key={role.value} value={role.value}>{role.label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => setEditingUser(null)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingUser(user.user_id)}
                              className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                              title="Ändra roll"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            {user.role !== 'owner' && (
                              <button
                                onClick={() => setShowDeleteConfirm(user.user_id)}
                                className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600"
                                title="Ta bort"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 overflow-hidden">
              <div className="p-4 border-b border-amber-200">
                <h3 className="font-semibold text-amber-800">Väntande inbjudningar ({pendingInvites.length})</h3>
              </div>
              <div className="divide-y divide-amber-100">
                {pendingInvites.map(invite => (
                  <div key={invite.user_id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-200 rounded-full flex items-center justify-center">
                        <span className="text-amber-700 text-sm">📧</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{invite.email}</p>
                        <p className="text-xs text-amber-600">Väntar på acceptans</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveUser(invite.user_id, true)}
                      className="p-2 hover:bg-amber-100 rounded-lg text-amber-600"
                      title="Ta bort inbjudan"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Teams Tab */}
      {activeTab === 'teams' && (
        <div className="space-y-6">
          {/* Create Team Form */}
          <div className="p-5 bg-gradient-to-r from-slate-50 to-white rounded-2xl border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Skapa nytt team</h3>
            <form onSubmit={handleCreateTeam} className="flex gap-4">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="T.ex. Kundtjänst, Support, Chefer..."
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                required
              />
              <button
                type="submit"
                disabled={creatingTeam}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium rounded-xl hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-violet-200"
              >
                {creatingTeam ? 'Skapar...' : 'Skapa'}
              </button>
            </form>
          </div>

          {/* Teams List */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Team ({teams.length})</h3>
            </div>
            
            {teams.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">👥</span>
                </div>
                <p className="text-slate-500 font-medium">Inga team ännu</p>
                <p className="text-sm text-slate-400 mt-1">Skapa team för att organisera användare</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {teams.map(team => (
                  <div key={team.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-indigo-400 rounded-xl flex items-center justify-center">
                          <span className="text-white text-sm">👥</span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{team.name}</p>
                          <p className="text-xs text-slate-500">{team.member_count || 0} medlemmar</p>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleDeleteTeam(team.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600"
                        title="Ta bort team"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Plan Tab */}
      {activeTab === 'plan' && (
        <div className="space-y-6">
          <div className="p-6 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-2xl border border-violet-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Din plan: {planLimit.name}</h3>
                <p className="text-sm text-slate-600">{planLimit.price}</p>
              </div>
              {plan !== 'enterprise' && (
                <button className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium rounded-xl hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-violet-200">
                  Uppgradera
                </button>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Användare</span>
                <span className="font-medium text-slate-800">{activeUsers.length} / {planLimit.users}</span>
              </div>
              <div className="w-full bg-violet-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-violet-500 to-indigo-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((activeUsers.length / planLimit.users) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Plan comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(PLAN_LIMITS).map(([key, value]) => (
              <div 
                key={key}
                className={`p-5 rounded-2xl border-2 ${
                  plan === key 
                    ? 'border-violet-500 bg-violet-50' 
                    : 'border-slate-200 bg-white'
                }`}
              >
                <h4 className="font-semibold text-slate-800">{value.name}</h4>
                <p className="text-2xl font-bold text-slate-800 mt-2">{value.price}</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  <li>✓ {value.users === 999 ? 'Obegränsade' : value.users} användare</li>
                  <li>✓ AI-chattbot</li>
                  <li>✓ Dashboard</li>
                  {key === 'pro' && <li>✓ Prioriterad support</li>}
                  {key === 'enterprise' && <li>✓ Dedikerad support</li>}
                  {key === 'enterprise' && <li>✓ SLA</li>}
                </ul>
                {plan === key ? (
                  <p className="mt-4 text-center text-sm font-medium text-violet-600">Nuvarande plan</p>
                ) : (
                  <button className="mt-4 w-full py-2 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all">
                    {key === 'enterprise' ? 'Kontakta oss' : 'Välj'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-xl">⚠️</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 text-center mb-2">
              Ta bort användare?
            </h3>
            <p className="text-sm text-slate-600 text-center mb-6">
              Användaren förlorar åtkomst till dashboarden. Detta kan inte ångras.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all"
              >
                Avbryt
              </button>
              <button
                onClick={() => handleRemoveUser(showDeleteConfirm)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition-all"
              >
                Ta bort
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
