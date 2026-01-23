import { createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  
  // Create user client for auth
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

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    redirect('/login')
  }

  // Check MFA
  const { data: { currentLevel } } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (currentLevel !== 'aal2') {
    redirect('/mfa/verify')
  }

  // Use admin client for data fetching
  const adminClient = createAdminClient()

  console.log('=== DEBUG START ===')
  console.log('User ID:', user.id)
  console.log('User Email:', user.email)

  // Check if superadmin
  const { data: superadminData, error: superadminError } = await adminClient
    .from('superadmins')
    .select('id')
    .eq('user_id', user.id)
    .single()
  
  console.log('Superadmin check:', { superadminData, superadminError })
  
  const isSuperadmin = !!superadminData

  let customers = []
  let initialCustomerId = null
  let customerPlan = 'starter'
  let userRole = 'member'
  let customerLogo = null
  let teamMembers = []

  if (isSuperadmin) {
    console.log('User is SUPERADMIN')
    // Superadmin sees all customers with logo_url
    const { data, error } = await adminClient
      .from('customers')
      .select('id, name, slug, plan, logo_url')
      .order('name')
    console.log('Superadmin customers:', { data, error })
    customers = data || []
    if (customers.length > 0) {
      initialCustomerId = customers[0].id
      customerPlan = customers[0].plan || 'starter'
      customerLogo = customers[0].logo_url
    }
    userRole = 'superadmin'
  } else {
    console.log('User is NOT superadmin, checking memberships...')
    
    // Check user_memberships for org-level access
    const { data: memberships, error: membershipError } = await adminClient
      .from('user_memberships')
      .select('id, role, organization_id, customer_id, team_id')
      .eq('user_id', user.id)

    console.log('Memberships query result:', { memberships, membershipError })

    if (memberships && memberships.length > 0) {
      const orgMembership = memberships.find(m => m.organization_id)
      console.log('Org membership found:', orgMembership)
      
      if (orgMembership) {
        // User has org access - get all customers in this organization
        const { data: orgCustomers, error: orgCustomersError } = await adminClient
          .from('customers')
          .select('id, name, slug, plan, logo_url')
          .eq('organization_id', orgMembership.organization_id)
          .order('name')
        
        console.log('Org customers query:', { 
          organization_id: orgMembership.organization_id,
          orgCustomers, 
          orgCustomersError 
        })
        
        customers = orgCustomers || []
        userRole = orgMembership.role || 'member'
        
        // Also get the organization's plan
        const { data: orgData } = await adminClient
          .from('organizations')
          .select('plan')
          .eq('id', orgMembership.organization_id)
          .single()
        
        if (orgData?.plan) {
          customerPlan = orgData.plan
        }
      } else if (memberships.some(m => m.customer_id)) {
        console.log('Direct customer access')
        // Direct customer access
        const customerIds = memberships.filter(m => m.customer_id).map(m => m.customer_id)
        
        const { data: customerData, error: customerError } = await adminClient
          .from('customers')
          .select('id, name, slug, plan, logo_url')
          .in('id', customerIds)
          .order('name')
        
        console.log('Direct customer query:', { customerIds, customerData, customerError })
        
        customers = customerData || []
        userRole = memberships[0]?.role || 'member'
      }

      if (customers.length > 0) {
        // Don't set initialCustomerId - let user see "Alla kunder" first
        initialCustomerId = null
        customerPlan = customers[0].plan || customerPlan
        customerLogo = customers[0].logo_url
      }
    } else {
      console.log('No memberships found, checking dashboard_users...')
      // Fallback to dashboard_users
      const { data: dashboardUser, error: dashboardError } = await adminClient
        .from('dashboard_users')
        .select('customer_id, customers(id, name, slug, plan, logo_url)')
        .eq('user_id', user.id)
        .single()

      console.log('Dashboard users query:', { dashboardUser, dashboardError })

      if (dashboardUser?.customers) {
        customers = [{
          id: dashboardUser.customers.id,
          name: dashboardUser.customers.name,
          slug: dashboardUser.customers.slug,
          plan: dashboardUser.customers.plan,
          logo_url: dashboardUser.customers.logo_url
        }]
        initialCustomerId = dashboardUser.customer_id
        customerPlan = dashboardUser.customers.plan || 'starter'
        customerLogo = dashboardUser.customers.logo_url
      }
    }
  }

  console.log('=== CUSTOMERS RESULT ===')
  console.log('Customers count:', customers.length)
  console.log('Customers:', customers.map(c => c.name))

  // Fetch sessions - get ALL sessions for the user's customers
  let sessions = []
  
  if (isSuperadmin) {
    // Superadmin sees all sessions
    const { data, error } = await adminClient
      .from('chat_sessions')
      .select(`
        id,
        customer_id,
        guest_name,
        guest_email,
        created_at,
        updated_at,
        is_read,
        assigned_to,
        assigned_type,
        deleted_at,
        customer:customers(name, slug)
      `)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(100)
    
    console.log('Superadmin sessions query:', { count: data?.length, error })
    sessions = data || []
  } else if (customers.length > 0) {
    // Get sessions for all user's customers
    const customerIds = customers.map(c => c.id)
    console.log('Fetching sessions for customerIds:', customerIds)
    
    const { data, error } = await adminClient
      .from('chat_sessions')
      .select(`
        id,
        customer_id,
        guest_name,
        guest_email,
        created_at,
        updated_at,
        is_read,
        assigned_to,
        assigned_type,
        deleted_at,
        customer:customers(name, slug)
      `)
      .in('customer_id', customerIds)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(100)
    
    console.log('Sessions query result:', { count: data?.length, error })
    sessions = data || []
  } else {
    console.log('No customers, skipping sessions fetch')
  }

  console.log('=== SESSIONS RESULT ===')
  console.log('Sessions count:', sessions.length)

  // Add message count and default is_read
  const sessionsWithCount = sessions.map(s => ({
    ...s,
    is_read: s.is_read ?? true,
    message_count: 0
  }))

  // Fetch team members for assignment (from all customers in org)
  if (customers.length > 0) {
    const customerIds = customers.map(c => c.id)
    
    // Get members from user_memberships
    const { data: members } = await adminClient
      .from('user_memberships')
      .select('user_id, role')
      .or(customerIds.map(id => `customer_id.eq.${id}`).join(','))

    // Also check dashboard_users as fallback
    const { data: dashboardMembers } = await adminClient
      .from('dashboard_users')
      .select('user_id')
      .in('customer_id', customerIds)

    const allMemberIds = new Set([
      ...(members || []).map(m => m.user_id),
      ...(dashboardMembers || []).map(m => m.user_id)
    ])

    // Get user details from user_profiles or auth
    if (allMemberIds.size > 0) {
      const { data: userProfiles } = await adminClient
        .from('user_profiles')
        .select('user_id, name, email')
        .in('user_id', Array.from(allMemberIds))

      if (userProfiles && userProfiles.length > 0) {
        teamMembers = userProfiles.map(p => ({
          id: p.user_id,
          name: p.name,
          email: p.email,
          role: members?.find(m => m.user_id === p.user_id)?.role || 'member'
        }))
      }
    }
  }

  console.log('=== FINAL OUTPUT ===')
  console.log('isSuperadmin:', isSuperadmin)
  console.log('customers:', customers.length)
  console.log('sessions:', sessionsWithCount.length)
  console.log('userRole:', userRole)
  console.log('=== DEBUG END ===')

  return (
    <DashboardClient
      user={user}
      isSuperadmin={isSuperadmin}
      customers={customers}
      initialSessions={sessionsWithCount}
      initialCustomerId={initialCustomerId}
      teamMembers={teamMembers}
      customerPlan={customerPlan}
      userRole={userRole}
      customerLogo={customerLogo}
    />
  )
}
