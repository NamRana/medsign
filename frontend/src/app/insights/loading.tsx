export default function InsightsLoading() {
  return (
    <div className="min-h-screen warm-bg px-4 pt-6 pb-24 animate-pulse">
      <div className="h-8 w-40 bg-gray-200 rounded-lg mb-6" />
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-2xl shadow-sm" />
        ))}
      </div>
      <div className="h-64 bg-white rounded-2xl shadow-sm mb-4" />
      <div className="h-48 bg-white rounded-2xl shadow-sm" />
    </div>
  );
}
