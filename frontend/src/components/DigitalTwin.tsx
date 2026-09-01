"use client";

import { useState, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DigitalTwinProps {
  hairHealth: number | null;
  skinQuality: number | null;
  stressLevel: number | null; // raw stress score (higher = more stressed)
  sleepQuality: number | null;
  onZoneTap?: (zone: string) => void;
  size?: "full" | "mini";
}

type ZoneId = "hair" | "face" | "temples" | "chest";

interface ZoneConfig {
  id: ZoneId;
  label: string;
  metric: string;
}

const ZONES: ZoneConfig[] = [
  { id: "hair", label: "Hair Health", metric: "hair_health_score" },
  { id: "face", label: "Skin Quality", metric: "skin_quality_score" },
  { id: "temples", label: "Stress Level", metric: "stress_level_score" },
  { id: "chest", label: "Sleep Quality", metric: "sleep_quality_score" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getZoneScore(zone: ZoneId, props: DigitalTwinProps): number | null {
  switch (zone) {
    case "hair":
      return props.hairHealth;
    case "face":
      return props.skinQuality;
    case "temples":
      // Invert: higher stress = lower wellness
      return props.stressLevel !== null ? 100 - props.stressLevel : null;
    case "chest":
      return props.sleepQuality;
  }
}

function getGlowColor(score: number | null): string {
  if (score === null) return "#9ca3af";
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#3b82f6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function getGlowIntensity(score: number | null): number {
  if (score === null) return 0.3;
  return 0.4 + (score / 100) * 0.6;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DigitalTwin({
  hairHealth,
  skinQuality,
  stressLevel,
  sleepQuality,
  onZoneTap,
  size = "full",
}: DigitalTwinProps) {
  const [selectedZone, setSelectedZone] = useState<ZoneId | null>(null);
  const [scanComplete, setScanComplete] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setScanComplete(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const props = { hairHealth, skinQuality, stressLevel, sleepQuality };
  const isMini = size === "mini";
  const svgHeight = isMini ? 150 : 300;
  const svgWidth = isMini ? 100 : 200;

  function handleZoneTap(zone: ZoneId) {
    setSelectedZone(zone);
    onZoneTap?.(zone);
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center ${
        isMini ? "p-3" : "p-6 sm:p-8"
      } rounded-3xl bg-slate-900 overflow-hidden`}
    >
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle, #475569 1px, transparent 1px)",
          backgroundSize: isMini ? "12px 12px" : "20px 20px",
        }}
      />

      {/* Scan line animation on first load */}
      {!scanComplete && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80 z-10"
          style={{
            animation: "scanLine 2s ease-in-out forwards",
          }}
        />
      )}

      {/* Title for full size */}
      {!isMini && (
        <div className="relative z-10 mb-4 text-center">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
            Digital Twin
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Body health map
          </p>
        </div>
      )}

      {/* SVG Body */}
      <div className="relative z-10">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox="0 0 200 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Body outline - base silhouette */}
          <path
            d="M100 40 C100 40 85 42 80 55 C75 68 78 80 80 85 C82 90 85 95 85 100 C85 105 80 110 75 115 C70 120 60 125 55 135 C50 145 50 155 52 165 C54 175 58 185 60 200 C62 215 62 235 63 250 C64 265 65 275 70 280 C75 285 80 285 85 280 L85 280 C87 278 88 275 88 270 C88 265 87 255 87 245 C87 235 88 225 90 220 C92 215 95 212 100 212 C105 212 108 215 110 220 C112 225 113 235 113 245 C113 255 112 265 112 270 C112 275 113 278 115 280 L115 280 C120 285 125 285 130 280 C135 275 136 265 137 250 C138 235 138 215 140 200 C142 185 146 175 148 165 C150 155 150 145 145 135 C140 125 130 120 125 115 C120 110 115 105 115 100 C115 95 118 90 120 85 C122 80 125 68 120 55 C115 42 100 40 100 40Z"
            fill="#1e293b"
            stroke="#334155"
            strokeWidth="1"
            opacity="0.8"
          />

          {/* Head circle outline */}
          <ellipse
            cx="100"
            cy="28"
            rx="22"
            ry="26"
            fill="#1e293b"
            stroke="#334155"
            strokeWidth="1"
          />

          {/* ── ZONE: Hair/Crown ── */}
          <g
            onClick={() => handleZoneTap("hair")}
            className="cursor-pointer"
            style={{ transition: "transform 0.2s ease" }}
          >
            <path
              d="M78 12 C78 5 88 2 100 2 C112 2 122 5 122 12 C122 18 115 22 100 22 C85 22 78 18 78 12Z"
              fill={getGlowColor(getZoneScore("hair", props))}
              opacity={getGlowIntensity(getZoneScore("hair", props))}
              style={{
                filter: `drop-shadow(0 0 ${isMini ? "4px" : "8px"} ${getGlowColor(getZoneScore("hair", props))})`,
                animation: hairHealth !== null ? "pulse0 3s ease-in-out infinite" : "none",
              }}
            />
            {selectedZone === "hair" && (
              <path
                d="M78 12 C78 5 88 2 100 2 C112 2 122 5 122 12 C122 18 115 22 100 22 C85 22 78 18 78 12Z"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                opacity="0.8"
                style={{
                  filter: "drop-shadow(0 0 6px #ffffff)",
                }}
              />
            )}
            {!isMini && (
              <text
                x="100"
                y="12"
                textAnchor="middle"
                fill="#fff"
                fontSize="7"
                fontWeight="600"
                opacity="0.9"
              >
                {hairHealth !== null ? hairHealth : "--"}
              </text>
            )}
          </g>

          {/* ── ZONE: Face ── */}
          <g
            onClick={() => handleZoneTap("face")}
            className="cursor-pointer"
          >
            <ellipse
              cx="100"
              cy="32"
              rx="14"
              ry="12"
              fill={getGlowColor(getZoneScore("face", props))}
              opacity={getGlowIntensity(getZoneScore("face", props))}
              style={{
                filter: `drop-shadow(0 0 ${isMini ? "4px" : "8px"} ${getGlowColor(getZoneScore("face", props))})`,
                animation: skinQuality !== null ? "pulse1 3s ease-in-out infinite 0.75s" : "none",
              }}
            />
            {selectedZone === "face" && (
              <ellipse
                cx="100"
                cy="32"
                rx="14"
                ry="12"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                opacity="0.8"
                style={{
                  filter: "drop-shadow(0 0 6px #ffffff)",
                }}
              />
            )}
            {!isMini && (
              <text
                x="100"
                y="35"
                textAnchor="middle"
                fill="#fff"
                fontSize="7"
                fontWeight="600"
                opacity="0.9"
              >
                {skinQuality !== null ? skinQuality : "--"}
              </text>
            )}
          </g>

          {/* ── ZONE: Temples (stress) ── */}
          <g
            onClick={() => handleZoneTap("temples")}
            className="cursor-pointer"
          >
            {/* Left temple */}
            <ellipse
              cx="76"
              cy="25"
              rx="6"
              ry="10"
              fill={getGlowColor(getZoneScore("temples", props))}
              opacity={getGlowIntensity(getZoneScore("temples", props))}
              style={{
                filter: `drop-shadow(0 0 ${isMini ? "3px" : "6px"} ${getGlowColor(getZoneScore("temples", props))})`,
                animation: stressLevel !== null ? "pulse2 3s ease-in-out infinite 1.5s" : "none",
              }}
            />
            {/* Right temple */}
            <ellipse
              cx="124"
              cy="25"
              rx="6"
              ry="10"
              fill={getGlowColor(getZoneScore("temples", props))}
              opacity={getGlowIntensity(getZoneScore("temples", props))}
              style={{
                filter: `drop-shadow(0 0 ${isMini ? "3px" : "6px"} ${getGlowColor(getZoneScore("temples", props))})`,
                animation: stressLevel !== null ? "pulse2 3s ease-in-out infinite 1.5s" : "none",
              }}
            />
            {selectedZone === "temples" && (
              <>
                <ellipse cx="76" cy="25" rx="6" ry="10" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.8" style={{ filter: "drop-shadow(0 0 4px #ffffff)" }} />
                <ellipse cx="124" cy="25" rx="6" ry="10" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.8" style={{ filter: "drop-shadow(0 0 4px #ffffff)" }} />
              </>
            )}
            {!isMini && (
              <text
                x="76"
                y="28"
                textAnchor="middle"
                fill="#fff"
                fontSize="6"
                fontWeight="600"
                opacity="0.9"
              >
                {stressLevel !== null ? (100 - stressLevel) : "--"}
              </text>
            )}
          </g>

          {/* ── ZONE: Chest/Torso ── */}
          <g
            onClick={() => handleZoneTap("chest")}
            className="cursor-pointer"
          >
            <ellipse
              cx="100"
              cy="130"
              rx="28"
              ry="35"
              fill={getGlowColor(getZoneScore("chest", props))}
              opacity={getGlowIntensity(getZoneScore("chest", props))}
              style={{
                filter: `drop-shadow(0 0 ${isMini ? "5px" : "12px"} ${getGlowColor(getZoneScore("chest", props))})`,
                animation: sleepQuality !== null ? "pulse3 3s ease-in-out infinite 2.25s" : "none",
              }}
            />
            {selectedZone === "chest" && (
              <ellipse
                cx="100"
                cy="130"
                rx="28"
                ry="35"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                opacity="0.8"
                style={{
                  filter: "drop-shadow(0 0 6px #ffffff)",
                }}
              />
            )}
            {!isMini && (
              <text
                x="100"
                y="133"
                textAnchor="middle"
                fill="#fff"
                fontSize="9"
                fontWeight="600"
                opacity="0.9"
              >
                {sleepQuality !== null ? sleepQuality : "--"}
              </text>
            )}
          </g>
        </svg>
      </div>

      {/* Zone labels (full size only) */}
      {!isMini && (
        <div className="relative z-10 mt-4 flex flex-wrap justify-center gap-2">
          {ZONES.map((zone) => {
            const score = getZoneScore(zone.id, props);
            const color = getGlowColor(score);
            const isSelected = selectedZone === zone.id;
            return (
              <button
                key={zone.id}
                onClick={() => handleZoneTap(zone.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                  isSelected
                    ? "bg-slate-700 ring-1 ring-white/30 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }}
                />
                {zone.label}
                <span className="text-slate-500 ml-0.5">
                  {score !== null ? score : "--"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Mini title */}
      {isMini && (
        <p className="relative z-10 mt-2 text-[10px] text-slate-400 font-medium text-center">
          Your Digital Twin
        </p>
      )}

      {/* CSS Keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scanLine {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.8; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes pulse0 {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes pulse1 {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes pulse2 {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes pulse3 {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}} />
    </div>
  );
}
