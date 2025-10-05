export default function UsageMetrics({ metrics }) {
  if (!metrics || metrics.length === 0) {
    return null
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage & Limits</h2>
      <div className="space-y-4">
        {metrics.map((metric) => {
          const percentage = (metric.used / metric.included) * 100
          return (
            <div key={metric.metric}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {metric.metric.replace(/_/g, ' ').toUpperCase()}
                </span>
                <span className="text-sm text-gray-600">
                  {metric.used.toLocaleString()} / {metric.included.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    percentage >= 90
                      ? 'bg-red-600'
                      : percentage >= 70
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-500">
                  {metric.remaining.toLocaleString()} remaining
                </span>
                <span className="text-xs text-gray-500">Period: {metric.periodKey}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
