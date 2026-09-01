"use client";

import { type ObservationDetail } from "@/lib/api";

const SEVERITY_COLORS: Record<string, { border: string; bg: string; marker: string }> = {
  info: { border: "border-emerald-400", bg: "bg-emerald-400/15", marker: "bg-emerald-600 text-white" },
  mild: { border: "border-amber-400", bg: "bg-amber-400/15", marker: "bg-amber-500 text-white" },
  moderate: { border: "border-orange-400", bg: "bg-orange-400/15", marker: "bg-orange-500 text-white" },
  severe: { border: "border-red-400", bg: "bg-red-400/15", marker: "bg-red-500 text-white" },
};

interface AnnotatedImageProps {
  imageUrl: string;
  observations: ObservationDetail[];
  highlightedIndex: number | null;
  onMarkerClick?: (index: number) => void;
}

export default function AnnotatedImage({
  imageUrl,
  observations,
  highlightedIndex,
  onMarkerClick,
}: AnnotatedImageProps) {
  const regioned = observations
    .map((obs, i) => ({ ...obs, index: i }))
    .filter((obs) => obs.region !== null);

  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-100">
      <img
        src={imageUrl}
        alt="Uploaded medical image"
        className="w-full block"
        draggable={false}
      />
      {regioned.map((obs) => {
        const r = obs.region!;
        const colors = SEVERITY_COLORS[obs.severity] || SEVERITY_COLORS.info;
        const isActive = highlightedIndex === obs.index;

        return (
          <div key={obs.index}>
            {/* Bounding rectangle */}
            <div
              style={{
                position: "absolute",
                top: `${r.y_min / 10}%`,
                left: `${r.x_min / 10}%`,
                width: `${(r.x_max - r.x_min) / 10}%`,
                height: `${(r.y_max - r.y_min) / 10}%`,
              }}
              className={`border-2 rounded-sm ${colors.border} ${colors.bg} transition-all duration-200 ${
                isActive ? "border-[3px] shadow-lg" : ""
              }`}
            />
            {/* Numbered marker */}
            <button
              type="button"
              onClick={() => onMarkerClick?.(obs.index)}
              style={{
                position: "absolute",
                top: `${r.y_min / 10}%`,
                left: `${r.x_min / 10}%`,
                transform: "translate(-40%, -40%)",
              }}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-md transition-transform duration-200 ${
                colors.marker
              } ${isActive ? "scale-125 ring-2 ring-white" : "hover:scale-110"}`}
            >
              {obs.index + 1}
            </button>
          </div>
        );
      })}
    </div>
  );
}
