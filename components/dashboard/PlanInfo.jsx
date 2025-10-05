export default function PlanInfo({ entitlements }) {
  if (!entitlements?.hasSubscription) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h2 className="text-yellow-800 font-semibold mb-2">No Active Subscription</h2>
        <p className="text-yellow-700">
          You don't have an active subscription yet. Please subscribe to a plan to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Plan</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-600">Plan</p>
          <p className="text-lg font-medium text-gray-900">
            {entitlements.planName} ({entitlements.planCode})
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Status</p>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              entitlements.status === 'active'
                ? 'bg-green-100 text-green-800'
                : entitlements.status === 'trialing'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {entitlements.status}
          </span>
        </div>
        <div>
          <p className="text-sm text-gray-600">Current Period</p>
          <p className="text-sm text-gray-900">
            {new Date(entitlements.currentPeriod.start).toLocaleDateString()} -{' '}
            {new Date(entitlements.currentPeriod.end).toLocaleDateString()}
          </p>
        </div>
        {entitlements.trialEnd && (
          <div>
            <p className="text-sm text-gray-600">Trial Ends</p>
            <p className="text-sm text-gray-900">
              {new Date(entitlements.trialEnd).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
