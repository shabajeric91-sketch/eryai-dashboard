import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  // Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  const isSuperadmin = user.email === process.env.SUPERADMIN_EMAIL

  // If not superadmin, verify they have access to this session
  if (!isSuperadmin) {
    const { data: dashboardUser } = await adminClient
      .from('dashboard_users')
      .select('customer_id')
      .eq('user_id', user.id)
      .single()

    if (!dashboardUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify session belongs to user's customer
    const { data: session } = await adminClient
      .from('chat_sessions')
      .select('customer_id')
      .eq('id', sessionId)
      .single()

    if (!session || session.customer_id !== dashboardUser.customer_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Fetch messages
  const { data: messages, error } = await adminClient
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ messages })
}
