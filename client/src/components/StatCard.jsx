export default function StatCard({ label, value, icon: Icon, trend = null }) {
  return (
    <div className="card stat-card group">
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label text-sm font-medium">{label}</p>
          <p className="stat-value text-3xl font-bold mt-2">{value ?? 0}</p>
          {trend && (
            <p className={`text-xs mt-2 ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% from last week
            </p>
          )}
        </div>
        {Icon && (
          <div className="stat-icon p-3 rounded-xl transition-all duration-300 group-hover:scale-110">
            <Icon size={24} className="text-indigo-500 dark:text-indigo-400" />
          </div>
        )}
      </div>
    </div>
  )
}
