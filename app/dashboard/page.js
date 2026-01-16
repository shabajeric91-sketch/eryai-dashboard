import { createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export default async function DashboardPage() {
  // Get current user
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
  
  if (!user) {
    redirect('/login')
  }

  // Check if superadmin
  const isSuperadmin = user.email === process.env.SUPERADMIN_EMAIL

  // Use admin client to bypass RLS
  const adminClient = createAdminClient()

  // Fetch sessions - simple query first
  const { data: sessions, error } = await adminClient
    .from('chat_sessions')
    .select('*')
    .order('session_start', { ascending: false })
    .limit(100)

  console.log('Sessions error:', error)
  console.log('Sessions count:', sessions?.length)

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
      customerId={null}
      customerName={null}
      initialSessions={sessions || []}
      customers={customers}
    />
  )
}
