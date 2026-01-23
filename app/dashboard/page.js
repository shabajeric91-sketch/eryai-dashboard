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

  // Check if superadmin
  const { data: superadminData } = await adminClient
    .from('superadmins')
    .select('id')
    .eq('user_id', user.id)
    .single()
  
  const isSuperadmin = !!superadminData

  let customers = []
  let initialCustomerId = null
  let customerPlan = 'starter'
  let userRole = 'member'
  let customerLogo = null
  let teamMembers = []

  if (isSuperadmin) {
    // Superadmin sees all customers with logo_url
    const { data } = await adminClient
      .from('customers')
      .select('id, name, slug, plan, logo_url')
      .order('name')
    customers = data || []
    if (customers.length > 0) {
      initialCustomerId = customers[0].id
      customerPlan = customers[0].plan || 'starter'
      customerLogo = customers[0].logo_url
    }
    userRole = 'superadmin'
  } else {
    // Check user_memberships for org-level access
    const { data: memberships } = await adminClient
      .from('user_memberships')
      .select(`
        role,
        organization_id,
        customer_id,
        organizations(id, name),
        customers(id, name, slug, plan, logo_url)
      `)
      .eq('user_id', user.id)

    if (memberships && memberships.length > 0) {
      const orgMembership = memberships.find(m => m.organization_id)
      
      if (orgMembership) {
        // User has org access - get all customers in org
        const { data: orgCustomers } = await adminClient
          .from('customers')
          .select('id, name, slug, plan, logo_url')
          .eq('organization_id', orgMembership.organization_id)
          .order('name')
        
        customers = orgCustomers || []
        userRole = orgMembership.role || 'member'
      } else {
        // Direct customer access
        customers = memberships
          .filter(m => m.customers)
          .map(m => ({
            id: m.customers.id,
            name: m.customers.name,
            slug: m.customers.slug,
            plan: m.customers.plan,
            logo_url: m.customers.logo_url
          }))
        userRole = memberships[0]?.role || 'member'
      }

      if (customers.length > 0) {
        initialCustomerId = customers[0].id
        customerPlan = customers[0].plan || 'starter'
        customerLogo = customers[0].logo_url
      }
    } else {
      // Fallback to dashboard_users
      const { data: dashboardUser } = await adminClient
        .from('dashboard_users')
        .select('customer_id, customers(id, name, slug, plan, logo_url)')
        .eq('user_id', user.id)
        .single()

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

  // Fetch sessions
  let sessionsQuery = adminClient
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

  if (!isSuperadmin && customers.length > 0) {
    const customerIds = customers.map(c => c.id)
    sessionsQuery = sessionsQuery.in('customer_id', customerIds)
  }

  const { data: sessions } = await sessionsQuery

  // Add message count and default is_read
  const sessionsWithCount = (sessions || []).map(s => ({
    ...s,
    is_read: s.is_read ?? true,
    message_count: 0
  }))

  // Fetch team members for assignment
  if (initialCustomerId) {
    const { data: members } = await adminClient
      .from('user_memberships')
      .select(`
        user_id,
        role,
        users:user_id(id, email)
      `)
      .eq('customer_id', initialCustomerId)

    // Also check dashboard_users as fallback
    const { data: dashboardMembers } = await adminClient
      .from('dashboard_users')
      .select('user_id')
      .eq('customer_id', initialCustomerId)

    const allMemberIds = new Set([
      ...(members || []).map(m => m.user_id),
      ...(dashboardMembers || []).map(m => m.user_id)
    ])

    // Get user details
    if (allMemberIds.size > 0) {
      const { data: userProfiles } = await adminClient
        .from('user_profiles')
        .select('user_id, name, email')
        .in('user_id', Array.from(allMemberIds))

      teamMembers = (userProfiles || []).map(p => ({
        id: p.user_id,
        name: p.name,
        email: p.email,
        role: members?.find(m => m.user_id === p.user_id)?.role || 'member'
      }))
    }
  }

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
