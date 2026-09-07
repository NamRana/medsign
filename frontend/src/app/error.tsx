"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="care-route-loader p-4">
      <div className="text-center max-w-sm warm-card rounded-3xl p-8 shadow-lg">
        <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-rose-100">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900">Something went wrong</h2>
        <p className="text-sm text-gray-500 mt-2">An unexpected error occurred. Please try again.</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={retry}
            className="care-auth-primary px-5 py-2.5 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="px-5 py-2.5 bg-teal-50 text-teal-800 text-sm font-semibold rounded-xl hover:bg-teal-100 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
