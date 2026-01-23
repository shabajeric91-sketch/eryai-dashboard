import { createAdminClient } from '@/lib/supabase-server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Helper: Get current user
async function getCurrentUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Helper: Check if user is superadmin
async function isSuperadmin(adminClient, email) {
  const { data } = await adminClient
    .from('superadmins')
    .select('id')
    .eq('email', email)
    .single()
  return !!data
}

// Helper: Get user's accessible customer IDs
async function getAccessibleCustomerIds(adminClient, userId, email) {
  // Check superadmin first
  if (await isSuperadmin(adminClient, email)) {
    return null // null = access to all
  }

  const { data: memberships } = await adminClient
    .from('user_memberships')
    .select('organization_id, customer_id')
    .eq('user_id', userId)

  if (!memberships || memberships.length === 0) {
    return []
  }

  // Check for org-level access
  const orgMembership = memberships.find(m => m.organization_id && !m.customer_id)
  if (orgMembership) {
    const { data: customers } = await adminClient
      .from('customers')
      .select('id')
      .eq('organization_id', orgMembership.organization_id)
    return customers?.map(c => c.id) || []
  }

  // Customer-level access
  return memberships.filter(m => m.customer_id).map(m => m.customer_id)
}

// PATCH: Update session (mark as read, assign, etc.)
export async function PATCH(request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId, action, data } = body

    if (!sessionId || !action) {
      return NextResponse.json({ error: 'Missing sessionId or action' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Verify user has access to this session
    const accessibleIds = await getAccessibleCustomerIds(adminClient, user.id, user.email)
    
    const { data: session } = await adminClient
      .from('chat_sessions')
      .select('id, customer_id')
      .eq('id', sessionId)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (accessibleIds !== null && !accessibleIds.includes(session.customer_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Handle different actions
    switch (action) {
      case 'markAsRead': {
        await adminClient
          .from('chat_sessions')
          .update({
            is_read: true,
            read_at: new Date().toISOString(),
            read_by: user.id
          })
          .eq('id', sessionId)
        
        return NextResponse.json({ success: true, action: 'markAsRead' })
      }

      case 'markAsUnread': {
        await adminClient
          .from('chat_sessions')
          .update({
            is_read: false,
            read_at: null,
            read_by: null
          })
          .eq('id', sessionId)
        
        return NextResponse.json({ success: true, action: 'markAsUnread' })
      }

      case 'assign': {
        const { toUserId, toTeamId, reason, note } = data || {}
        
        // Get current assignment for escalation history
        const { data: currentSession } = await adminClient
          .from('chat_sessions')
          .select('assigned_user_id, assigned_team_id')
          .eq('id', sessionId)
          .single()

        // Update session
        await adminClient
          .from('chat_sessions')
          .update({
            assigned_user_id: toUserId || null,
            assigned_team_id: toTeamId || null,
            escalation_level: currentSession?.assigned_user_id || currentSession?.assigned_team_id 
              ? { increment: 1 } 
              : 1
          })
          .eq('id', sessionId)

        // Log escalation
        await adminClient
          .from('session_escalations')
          .insert({
            session_id: sessionId,
            from_user_id: currentSession?.assigned_user_id,
            from_team_id: currentSession?.assigned_team_id,
            to_user_id: toUserId,
            to_team_id: toTeamId,
            reason,
            note,
            created_by: user.id
          })

        return NextResponse.json({ success: true, action: 'assign' })
      }

      case 'delete': {
        // Soft delete or hard delete? For now, hard delete
        await adminClient
          .from('chat_sessions')
          .delete()
          .eq('id', sessionId)
        
        return NextResponse.json({ success: true, action: 'delete' })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Session API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Bulk actions (mark all as read)
export async function POST(request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, customerId } = body

    const adminClient = createAdminClient()

    // Verify access
    const accessibleIds = await getAccessibleCustomerIds(adminClient, user.id, user.email)

    switch (action) {
      case 'markAllAsRead': {
        let query = adminClient
          .from('chat_sessions')
          .update({
            is_read: true,
            read_at: new Date().toISOString(),
            read_by: user.id
          })
          .eq('is_read', false)

        // Filter by accessible customers
        if (accessibleIds !== null) {
          query = query.in('customer_id', accessibleIds)
        }

        // Optional: filter by specific customer
        if (customerId) {
          query = query.eq('customer_id', customerId)
        }

        const { error } = await query

        if (error) throw error

        return NextResponse.json({ success: true, action: 'markAllAsRead' })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Session bulk API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
