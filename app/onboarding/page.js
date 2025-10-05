import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getUserOrganization } from '@/lib/onboarding/check-org'
import OnboardingForm from '@/components/onboarding-form'

/**
 * Onboarding page - shown after Clerk signup
 * Protected route: requires authentication
 * Redirects to dashboard if user already has org
 */
export default async function OnboardingPage() {
  // Check authentication
  const { userId } = await auth()

  if (!userId) {
    // User not authenticated, redirect to sign-in
    redirect('/sign-in')
  }

  // Check if user already has an organization
  const organization = await getUserOrganization(userId)

  if (organization) {
    // User already onboarded, redirect to dashboard
    redirect('/dashboard')
  }

  // User needs to complete onboarding
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section with Gradient */}
      <div className="gradient-bg text-white py-12 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-5xl mb-4">🎯</div>
          <h1 className="text-4xl font-bold mb-2">Welcome to Metered Subscriptions</h1>
          <p className="text-lg opacity-90">Let's get your organization set up</p>
        </div>
      </div>

      {/* Onboarding Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 bg-light">
        <OnboardingForm />
      </div>
    </div>
  )
}
