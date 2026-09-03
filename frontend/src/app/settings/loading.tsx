export default function SettingsLoading() {
  return (
    <div className="min-h-screen warm-bg px-4 pt-6 pb-24 animate-pulse">
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 bg-gray-200 rounded-full mb-3" />
        <div className="h-5 w-32 bg-gray-200 rounded mb-1" />
        <div className="h-4 w-44 bg-gray-200 rounded" />
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-14 bg-white rounded-2xl shadow-sm mb-3" />
      ))}
    </div>
  );
}
