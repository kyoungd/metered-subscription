import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getUserOrganization } from '@/lib/onboarding/check-org'

/**
 * Dashboard page - main app view after onboarding
 * Protected route: requires auth + organization
 */
export default async function DashboardPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // Check if user has completed onboarding
  const organization = await getUserOrganization(userId)

  if (!organization) {
    // User hasn't completed onboarding yet
    redirect('/onboarding')
  }

  return (
    <div className="min-h-screen bg-light">
      {/* Header */}
      <div className="gradient-bg text-white py-6 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm opacity-90 mt-1">{organization.name}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--color-primary)' }}>
            Welcome! Your trial has started 🎉
          </h2>
          <p className="text-gray-600 mb-4">
            You now have access to all features for 14 days.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border-2 border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">Organization</div>
              <div className="text-lg font-semibold">{organization.name}</div>
            </div>
            <div className="border-2 border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">Plan</div>
              <div className="text-lg font-semibold">Starter (Trial)</div>
            </div>
            <div className="border-2 border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">Trial Days Left</div>
              <div className="text-lg font-semibold">14 days</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Next Steps</h3>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-2xl">📊</span>
              <div>
                <div className="font-semibold">Explore your usage dashboard</div>
                <div className="text-sm text-gray-600">Track your API calls and usage metrics</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-2xl">🔧</span>
              <div>
                <div className="font-semibold">Set up your API integration</div>
                <div className="text-sm text-gray-600">Get your API keys and start making calls</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-2xl">👥</span>
              <div>
                <div className="font-semibold">Invite team members</div>
                <div className="text-sm text-gray-600">Collaborate with your team</div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
