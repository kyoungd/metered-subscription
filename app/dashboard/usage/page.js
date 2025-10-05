'use client'

import { useEffect, useState } from 'react'
import PlanInfo from '@/components/dashboard/PlanInfo'
import UsageMetrics from '@/components/dashboard/UsageMetrics'

export default function UsagePage() {
  const [entitlements, setEntitlements] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchEntitlements()
  }, [])

  const fetchEntitlements = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/me/entitlements')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch entitlements')
      }

      setEntitlements(data.data)
    } catch (err) {
      console.error('Failed to fetch entitlements:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading usage data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold mb-2">Error</h2>
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchEntitlements}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Usage & Billing</h1>

      <div className="space-y-6">
        {/* Plan Info */}
        <PlanInfo entitlements={entitlements} />

        {/* Usage Metrics */}
        {entitlements?.hasSubscription && (
          <UsageMetrics metrics={entitlements.metrics} />
        )}

        {/* Debug Info (dev only) */}
        {process.env.NODE_ENV === 'development' && entitlements && (
          <details className="bg-gray-100 rounded-lg p-4">
            <summary className="cursor-pointer font-medium text-gray-700">
              Debug Info (Dev Only)
            </summary>
            <pre className="mt-2 text-xs overflow-auto">
              {JSON.stringify(entitlements, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
