import { createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  console.log('🏠 DashboardPage loading...')
  
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
    console.log('🏠 No user, redirecting to login')
    redirect('/login')
  }
  console.log('🏠 User:', user.email)

  // Use admin client to bypass RLS
  const adminClient = createAdminClient()

  // Check if superadmin (from superadmins table)
  const { data: superadminData } = await adminClient
    .from('superadmins')
    .select('id')
    .eq('email', user.email)
    .single()
  
  const isSuperadmin = !!superadminData
  console.log('🏠 Is superadmin:', isSuperadmin)

  // Get user's memberships and access
  let customerId = null
  let customerName = null
  let organizationId = null
  let accessibleCustomerIds = []

  if (!isSuperadmin) {
    // Get user's memberships
    const { data: memberships, error: memError } = await adminClient
      .from('user_memberships')
      .select(`
        role,
        organization_id,
        customer_id,
        organizations(id, name),
        customers(id, name)
      `)
      .eq('user_id', user.id)
    
    console.log('🏠 Memberships:', memberships, 'Error:', memError)

    if (memberships && memberships.length > 0) {
      // Check if user has org-level access (customer_id is null)
      const orgMembership = memberships.find(m => m.organization_id && !m.customer_id)
      
      if (orgMembership) {
        // Org-level access - can see all customers in org
        organizationId = orgMembership.organization_id
        
        // Get all customers in this org
        const { data: orgCustomers } = await adminClient
          .from('customers')
          .select('id, name')
          .eq('organization_id', organizationId)
        
        accessibleCustomerIds = orgCustomers?.map(c => c.id) || []
        console.log('🏠 Org-level access, customers:', accessibleCustomerIds.length)
      } else {
        // Customer-level access only
        const customerMembership = memberships.find(m => m.customer_id)
        if (customerMembership) {
          customerId = customerMembership.customer_id
          customerName = customerMembership.customers?.name || null
          accessibleCustomerIds = [customerId]
        }
      }
    }
  }

  console.log('🏠 CustomerId:', customerId, 'OrgId:', organizationId, 'Accessible:', accessibleCustomerIds.length)

  // Fetch sessions
  let sessionsQuery = adminClient
    .from('chat_sessions')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (isSuperadmin) {
    // Superadmin sees ALL sessions including suspicious
    // No filter needed
  } else if (accessibleCustomerIds.length > 0) {
    // User with access - filter by their customers, hide suspicious
    sessionsQuery = sessionsQuery
      .in('customer_id', accessibleCustomerIds)
      .or('suspicious.is.null,suspicious.eq.false')
  } else {
    // No access - return empty
    sessionsQuery = sessionsQuery.eq('customer_id', '00000000-0000-0000-0000-000000000000')
  }

  const { data: sessions, error } = await sessionsQuery

  console.log('🏠 Sessions error:', error)
  console.log('🏠 Sessions count:', sessions?.length)

  // Get all customers for filter (superadmin or org-level access)
  let customers = []
  if (isSuperadmin) {
    const { data: allCustomers } = await adminClient
      .from('customers')
      .select('id, name')
      .order('name')
    customers = allCustomers || []
  } else if (organizationId) {
    const { data: orgCustomers } = await adminClient
      .from('customers')
      .select('id, name')
      .eq('organization_id', organizationId)
      .order('name')
    customers = orgCustomers || []
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
