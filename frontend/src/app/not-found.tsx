import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen warm-bg flex items-center justify-center p-4">
      <div className="text-center max-w-sm warm-card rounded-3xl p-8 shadow-lg">
        <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900">Page not found</h2>
        <p className="text-sm text-gray-500 mt-2">The page you are looking for does not exist or has been moved.</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
