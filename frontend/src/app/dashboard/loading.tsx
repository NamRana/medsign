export default function DashboardLoading() {
  return (
    <div className="min-h-screen warm-bg px-4 pt-6 pb-24 animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded-lg mb-6" />
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-2xl shadow-sm" />
        ))}
      </div>
      <div className="h-48 bg-white rounded-2xl shadow-sm mb-4" />
      <div className="h-32 bg-white rounded-2xl shadow-sm" />
    </div>
  );
}
