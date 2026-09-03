export default function ChatLoading() {
  return (
    <div className="min-h-screen warm-bg flex flex-col animate-pulse">
      <div className="h-14 bg-white border-b border-gray-100 flex items-center px-4">
        <div className="h-5 w-32 bg-gray-200 rounded" />
      </div>
      <div className="flex-1 px-4 pt-6 space-y-4">
        <div className="h-16 w-3/4 bg-gray-200 rounded-2xl" />
        <div className="h-12 w-1/2 bg-emerald-100 rounded-2xl ml-auto" />
        <div className="h-20 w-3/4 bg-gray-200 rounded-2xl" />
      </div>
      <div className="h-16 bg-white border-t border-gray-100" />
    </div>
  );
}
