'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TestSupabasePage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [envCheck, setEnvCheck] = useState<{url: boolean, key: boolean}>({url: false, key: false})

  useEffect(() => {
    async function testConnection() {
      // Check environment variables
      const urlExists = !!process.env.NEXT_PUBLIC_SUPABASE_URL
      const keyExists = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      setEnvCheck({ url: urlExists, key: keyExists })

      if (!urlExists || !keyExists) {
        setStatus('error')
        setMessage('Missing environment variables. Check .env.local file.')
        return
      }

      try {
        const supabase = createClient()

        // Test 1: Check if we can reach Supabase
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          setStatus('error')
          setMessage(`Auth error: ${error.message}`)
          return
        }

        // Test 2: Try a simple query to check database connection
        const { error: dbError } = await supabase
          .from('organizations')
          .select('id')
          .limit(1)

        if (dbError) {
          // This might be expected if RLS blocks access or table doesn't exist
          setStatus('success')
          setMessage(`Connection OK! DB query returned: ${dbError.message} (this may be expected due to RLS)`)
          return
        }

        setStatus('success')
        setMessage('Supabase connection successful! Database accessible.')
      } catch (err) {
        setStatus('error')
        setMessage(`Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    testConnection()
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-bold mb-6">Supabase Connection Test</h1>

      <div className="space-y-4">
        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="font-semibold mb-2">Environment Variables</h2>
          <ul className="space-y-1">
            <li className={envCheck.url ? 'text-green-400' : 'text-red-400'}>
              {envCheck.url ? '✓' : '✗'} NEXT_PUBLIC_SUPABASE_URL
            </li>
            <li className={envCheck.key ? 'text-green-400' : 'text-red-400'}>
              {envCheck.key ? '✓' : '✗'} NEXT_PUBLIC_SUPABASE_ANON_KEY
            </li>
          </ul>
        </div>

        <div className={`p-4 rounded-lg ${
          status === 'loading' ? 'bg-yellow-900' :
          status === 'success' ? 'bg-green-900' : 'bg-red-900'
        }`}>
          <h2 className="font-semibold mb-2">Connection Status</h2>
          <p>
            {status === 'loading' && '⏳ Testing connection...'}
            {status === 'success' && `✓ ${message}`}
            {status === 'error' && `✗ ${message}`}
          </p>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="font-semibold mb-2">Expected Setup</h2>
          <ol className="list-decimal list-inside space-y-1 text-gray-300">
            <li>Create <code className="bg-gray-700 px-1 rounded">.env.local</code> from <code className="bg-gray-700 px-1 rounded">.env.local.example</code></li>
            <li>Add your Supabase project URL</li>
            <li>Add your Supabase anon key</li>
            <li>Run migrations in Supabase dashboard</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
