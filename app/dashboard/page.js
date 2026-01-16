import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Check if superadmin
  const isSuperadmin = user.email === process.env.SUPERADMIN_EMAIL

  // Get user's customer_id from profile (if not superadmin)
  let customerId = null
  let customerName = null
  
  if (!isSuperadmin) {
    // Fetch from dashboard_users table
    const { data: dashboardUser } = await adminClient
      .from('dashboard_users')
      .select('customer_id, customers(name)')
      .eq('user_id', user.id)
      .single()
    
    if (dashboardUser) {
      customerId = dashboardUser.customer_id
      customerName = dashboardUser.customers?.name
    }
  }

  // Fetch sessions based on role
  let sessionsQuery = adminClient
    .from('chat_sessions')
    .select(`
      id,
      customer_id,
      visitor_id,
      session_start,
      session_end,
      message_count,
      status,
      metadata,
      updated_at,
      customers(name)
    `)
    .order('updated_at', { ascending: false })
    .limit(100)

  // If not superadmin, filter by customer_id
  if (!isSuperadmin && customerId) {
    sessionsQuery = sessionsQuery.eq('customer_id', customerId)
  }

  const { data: sessions, error } = await sessionsQuery

  // Get all customers for filter (superadmin only)
  let customers = []
  if (isSuperadmin) {
    const { data: allCustomers } = await adminClient
      .from('customers')
      .select('id, name')
      .order('name')
    customers = allCustomers || []
  }

  return (
    <DashboardClient
      user={user}
      isSuperadmin={isSuperadmin}
      customerId={customerId}
      customerName={customerName}
      initialSessions={sessions || []}
      customers={customers}
    />
  )
}
