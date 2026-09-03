"use client";

import { useRouter } from "next/navigation";

interface UpgradeModalProps {
  feature: string;
  used: number;
  limit: number;
  onClose: () => void;
}

export default function UpgradeModal({ feature, used, limit, onClose }: UpgradeModalProps) {
  const router = useRouter();

  const featureLabels: Record<string, string> = {
    assessments: "health assessments",
    lab_reports: "lab report uploads",
    face_scans: "face scans",
    image_analyses: "image analyses",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-7 animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center">
          <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-4V8m0 0L9 11m3-3l3 3" />
          </svg>
        </div>

        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Free Limit Reached</h3>
        <p className="text-sm text-gray-500 text-center mb-5">
          You&apos;ve used <span className="font-semibold text-gray-700">{used}/{limit}</span> free {featureLabels[feature] || feature} this month.
          Upgrade to Pro for unlimited access.
        </p>

        <div className="bg-emerald-50 rounded-xl p-4 mb-5">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">MedSign Pro includes</p>
          <ul className="space-y-1.5">
            {["Unlimited assessments", "Unlimited lab reports", "Unlimited face scans", "Hindi language support"].map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-emerald-800">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => router.push("/pricing")}
          className="w-full py-3 text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl hover:shadow-lg hover:shadow-emerald-200/50 transition"
        >
          Upgrade to Pro — ₹199/mo
        </button>
        <button onClick={onClose} className="w-full mt-2 py-2.5 text-xs text-gray-400 hover:text-gray-600 transition">
          Maybe later
        </button>
      </div>
    </div>
  );
}
