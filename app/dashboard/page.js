'use client'

import { useUser } from '@clerk/nextjs'

export default function DashboardPage() {
  const { user } = useUser()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">
        Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
      </h1>
      <p className="text-gray-600">
        This is your dashboard. More features coming soon.
      </p>
    </div>
  )
}
