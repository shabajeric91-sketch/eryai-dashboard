'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) throw signInError

      // Check MFA status
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

      if (aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2') {
        // User has MFA, needs to verify
        router.push('/mfa/verify')
      } else {
        // Check if user needs to set up MFA
        const { data: factors } = await supabase.auth.mfa.listFactors()
        if (!factors?.totp || factors.totp.length === 0) {
          router.push('/mfa/setup')
        } else {
          router.push('/dashboard')
        }
      }
      
    } catch (err) {
      setError(err.message || 'Inloggningen misslyckades')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-eryai-50 to-eryai-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-eryai-600">EryAI</h1>
          <p className="text-gray-500 mt-2">Dashboard</p>
        </div>

        {/* Error message */}
        {error && (
          <div classN
