"use client";

import { useMemo, useState, useEffect } from "react";

interface HealthAvatarProps {
  hairHealth: number | null;   // 0-100
  skinQuality: number | null;  // 0-100
  stressLevel: number | null;  // 0-100 (higher = more stressed)
  sleepQuality: number | null; // 0-100
  overallScore: number | null; // 0-100
  size?: "sm" | "md" | "lg";  // sm=80px, md=160px, lg=240px
  showMood?: boolean;          // show speech bubble with mood text
  userName?: string;           // for personalization
}

const SIZE_MAP = { sm: 80, md: 160, lg: 240 } as const;

// Mood text pools by tier
const MOOD_TEXTS: Record<string, string[]> = {
  excellent: ["Feeling amazing!", "I'm glowing!", "Keep it up!", "On top of the world!"],
  good: ["Doing good!", "Pretty well today", "Feeling alright!", "Going strong!"],
  okay: ["Could be better...", "A bit tired", "Hanging in there", "So-so today"],
  low: ["Need some care...", "Help me feel better", "A little rough...", "Could use a hug"],
  noData: ["Scan me!", "Let's get started!", "Take a scan!", "Bring me to life!"],
};

function getMoodTier(score: number | null): string {
  if (score === null) return "noData";
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "okay";
  return "low";
}

function getAuraColor(score: number | null): { start: string; end: string } {
  if (score === null) return { start: "#e2e8f0", end: "#cbd5e1" };
  if (score >= 80) return { start: "#6ee7b7", end: "#34d399" };
  if (score >= 60) return { start: "#93c5fd", end: "#60a5fa" };
  if (score >= 40) return { start: "#fcd34d", end: "#fbbf24" };
  return { start: "#c4b5fd", end: "#a78bfa" };
}

function getSkinColor(quality: number | null): string {
  if (quality === null) return "#f5d0a9";
  if (quality >= 80) return "#fbbf7a";  // warm radiant
  if (quality >= 60) return "#f5d0a9";  // normal warm
  if (quality >= 40) return "#e8c9a0";  // slightly pale
  return "#dfc4a0";                      // dull pale
}

function getBodyColor(quality: number | null): string {
  if (quality === null) return "#a7d8f5";
  if (quality >= 80) return "#7dd3fc";
  if (quality >= 60) return "#a7d8f5";
  if (quality >= 40) return "#bae0f7";
  return "#cbd5e1";
}

function getHairColor(health: number | null): { main: string; shine: string } {
  if (health === null) return { main: "#6b5b4f", shine: "#8b7b6f" };
  if (health >= 80) return { main: "#4a3728", shine: "#8b6914" };
  if (health >= 50) return { main: "#5c4a3a", shine: "#7a6a5a" };
  return { main: "#7a6a5a", shine: "#8a7a6a" };
}

export default function HealthAvatar({
  hairHealth,
  skinQuality,
  stressLevel,
  sleepQuality,
  overallScore,
  size = "md",
  showMood = false,
  userName: _userName,
}: HealthAvatarProps) {
  void _userName; // reserved for future personalization
  const px = SIZE_MAP[size];
  const scale = px / 160; // base design is 160px
  const [blinkKey, setBlinkKey] = useState(0);

  const tier = useMemo(() => getMoodTier(overallScore), [overallScore]);
  const aura = useMemo(() => getAuraColor(overallScore), [overallScore]);
  const skin = useMemo(() => getSkinColor(skinQuality), [skinQuality]);
  const body = useMemo(() => getBodyColor(skinQuality), [skinQuality]);
  const hair = useMemo(() => getHairColor(hairHealth), [hairHealth]);

  // Mood text: pick deterministically based on tier, rotate via state on interval
  const [moodIndex, setMoodIndex] = useState(0);
  const moodText = useMemo(() => {
    const pool = MOOD_TEXTS[tier];
    return pool[moodIndex % pool.length];
  }, [tier, moodIndex]);

  // Rotate mood text every 8 seconds for variety
  useEffect(() => {
    const interval = setInterval(() => {
      setMoodIndex((i) => i + 1);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Blink animation trigger
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkKey((k) => k + 1);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  // Animation params based on overall score
  const bounceAmplitude = overallScore === null ? 1 : overallScore >= 80 ? 3 : overallScore >= 50 ? 2 : 1;
  const bounceDuration = overallScore === null ? 4 : overallScore >= 80 ? 2 : overallScore >= 50 ? 3 : 4;

  // Stress-based expression
  const stress = stressLevel ?? 50;
  const sleep = sleepQuality ?? 50;
  const hairVal = hairHealth ?? 50;

  return (
    <div
      className="relative inline-flex flex-col items-center"
      style={{ width: px, height: showMood ? px + 40 * scale : px }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes avatar-bounce-${size} {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-${bounceAmplitude}px); }
        }
        @keyframes avatar-blink {
          0%, 90%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.1); }
        }
        @keyframes avatar-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes sparkle-rotate {
          0% { transform: rotate(0deg) scale(1); opacity: 1; }
          50% { transform: rotate(180deg) scale(0.5); opacity: 0.4; }
          100% { transform: rotate(360deg) scale(1); opacity: 1; }
        }
        @keyframes float-zzz {
          0% { transform: translateY(0) translateX(0); opacity: 1; }
          100% { transform: translateY(-${12 * scale}px) translateX(${5 * scale}px); opacity: 0; }
        }
        @keyframes sweat-drop {
          0%, 80% { transform: translateY(0); opacity: 0.8; }
          100% { transform: translateY(${6 * scale}px); opacity: 0; }
        }
        @keyframes hair-sway {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(1.5deg); }
        }
        @keyframes bubble-pop {
          0% { transform: scale(0) translateY(0); opacity: 0; }
          20% { transform: scale(1) translateY(0); opacity: 1; }
          80% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(0.8) translateY(-4px); opacity: 0; }
        }
      `}</style>

      {/* Speech Bubble */}
      {showMood && moodText && (
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
          style={{
            marginTop: -4 * scale,
            animation: "bubble-pop 4s ease-in-out infinite",
          }}
        >
          <div
            className="bg-white rounded-full px-3 py-1 shadow-md border border-gray-100 whitespace-nowrap"
            style={{ fontSize: Math.max(9, 11 * scale) }}
          >
            <span className="text-gray-700 font-medium">{moodText}</span>
          </div>
          <div
            className="w-2 h-2 bg-white border-b border-r border-gray-100 rotate-45 mx-auto -mt-1"
          />
        </div>
      )}

      {/* Main Avatar Container with bounce animation */}
      <div
        className="relative"
        style={{
          width: px,
          height: px,
          animation: `avatar-bounce-${size} ${bounceDuration}s ease-in-out infinite`,
        }}
      >
        <svg
          width={px}
          height={px}
          viewBox="0 0 160 160"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id={`aura-grad-${size}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={aura.start} stopOpacity="0.5" />
              <stop offset="70%" stopColor={aura.end} stopOpacity="0.2" />
              <stop offset="100%" stopColor={aura.end} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`skin-grad-${size}`} cx="40%" cy="35%" r="60%">
              <stop offset="0%" stopColor={skin} stopOpacity="1" />
              <stop offset="100%" stopColor={skin} stopOpacity="0.85" />
            </radialGradient>
            <linearGradient id={`hair-grad-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={hair.main} />
              <stop offset="50%" stopColor={hair.shine} />
              <stop offset="100%" stopColor={hair.main} />
            </linearGradient>
            <linearGradient id={`body-grad-${size}`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor={body} />
              <stop offset="100%" stopColor={body} stopOpacity="0.7" />
            </linearGradient>
          </defs>

          {/* 1. Aura glow background */}
          <circle cx="80" cy="80" r="78" fill={`url(#aura-grad-${size})`} />

          {/* 2. Body - rounded pill shape */}
          <ellipse
            cx="80" cy="120" rx="28" ry="30"
            fill={`url(#body-grad-${size})`}
            style={{ animation: "avatar-breathe 4s ease-in-out infinite" }}
          />

          {/* 3. Face shape - circle */}
          <circle cx="80" cy="72" r="36" fill={`url(#skin-grad-${size})`} />

          {/* 4. Hair */}
          <g style={{ animation: "hair-sway 3s ease-in-out infinite", transformOrigin: "80px 50px" }}>
            {hairVal >= 80 ? (
              // Full, lush hair with shine
              <>
                <path
                  d="M44 62 C44 38 60 28 80 28 C100 28 116 38 116 62 C116 55 108 42 80 42 C52 42 44 55 44 62Z"
                  fill={`url(#hair-grad-${size})`}
                />
                <path
                  d="M50 56 C50 40 62 32 80 32 C98 32 110 40 110 56"
                  fill="none" stroke={hair.shine} strokeWidth="2" strokeOpacity="0.6"
                />
                {/* Shimmer highlight */}
                <ellipse cx="70" cy="40" rx="8" ry="4" fill="white" fillOpacity="0.25" />
              </>
            ) : hairVal >= 50 ? (
              // Normal hair
              <path
                d="M46 62 C46 40 62 30 80 30 C98 30 114 40 114 62 C114 55 106 44 80 44 C54 44 46 55 46 62Z"
                fill={hair.main}
              />
            ) : (
              // Thin, sparse hair
              <>
                <path
                  d="M50 60 C50 44 64 34 80 34 C96 34 110 44 110 60 C110 54 102 46 80 46 C58 46 50 54 50 60Z"
                  fill={hair.main} fillOpacity="0.7"
                />
                <path d="M60 42 C65 36 75 34 80 34" stroke={hair.main} strokeWidth="2" strokeOpacity="0.5" fill="none" />
                <path d="M100 42 C95 36 85 34 80 34" stroke={hair.main} strokeWidth="2" strokeOpacity="0.5" fill="none" />
              </>
            )}
          </g>

          {/* 5. Eyes */}
          <g
            key={blinkKey}
            style={{ animation: "avatar-blink 4s ease-in-out", transformOrigin: "80px 70px" }}
          >
            {sleep >= 80 ? (
              // Wide, bright, sparkly eyes
              <>
                <ellipse cx="67" cy="70" rx="6" ry="6.5" fill="#2d2d2d" />
                <ellipse cx="93" cy="70" rx="6" ry="6.5" fill="#2d2d2d" />
                {/* Star highlights */}
                <circle cx="65" cy="67" r="2.5" fill="white" />
                <circle cx="91" cy="67" r="2.5" fill="white" />
                <circle cx="69" cy="72" r="1.2" fill="white" fillOpacity="0.7" />
                <circle cx="95" cy="72" r="1.2" fill="white" fillOpacity="0.7" />
              </>
            ) : sleep >= 50 ? (
              // Normal alert eyes
              <>
                <ellipse cx="67" cy="70" rx="5" ry="5.5" fill="#2d2d2d" />
                <ellipse cx="93" cy="70" rx="5" ry="5.5" fill="#2d2d2d" />
                <circle cx="65" cy="68" r="2" fill="white" />
                <circle cx="91" cy="68" r="2" fill="white" />
              </>
            ) : (
              // Droopy, half-closed with under-eye shadows
              <>
                {/* Under-eye shadows */}
                <ellipse cx="67" cy="74" rx="7" ry="3" fill="#c4a882" fillOpacity="0.3" />
                <ellipse cx="93" cy="74" rx="7" ry="3" fill="#c4a882" fillOpacity="0.3" />
                {/* Half-closed eyes */}
                <ellipse cx="67" cy="71" rx="5" ry="3.5" fill="#2d2d2d" />
                <ellipse cx="93" cy="71" rx="5" ry="3.5" fill="#2d2d2d" />
                {/* Droopy eyelids */}
                <path d="M61 68 Q67 65 73 68" stroke={skin} strokeWidth="3" fill={skin} />
                <path d="M87 68 Q93 65 99 68" stroke={skin} strokeWidth="3" fill={skin} />
                <circle cx="65" cy="70" r="1.5" fill="white" fillOpacity="0.5" />
                <circle cx="91" cy="70" r="1.5" fill="white" fillOpacity="0.5" />
              </>
            )}
          </g>

          {/* 6. Mouth/Expression based on stress */}
          {stress < 30 ? (
            // Big happy smile
            <path d="M68 84 Q80 96 92 84" stroke="#4a3728" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          ) : stress < 60 ? (
            // Slight smile
            <path d="M70 85 Q80 91 90 85" stroke="#4a3728" strokeWidth="2" strokeLinecap="round" fill="none" />
          ) : stress < 80 ? (
            // Flat/neutral
            <path d="M71 87 L89 87" stroke="#4a3728" strokeWidth="2" strokeLinecap="round" />
          ) : (
            // Worried frown
            <path d="M70 90 Q80 85 90 90" stroke="#4a3728" strokeWidth="2" strokeLinecap="round" fill="none" />
          )}

          {/* 7. Cheeks - blush */}
          <circle cx="57" cy="80" r="5" fill="#f9a8d4" fillOpacity={overallScore !== null && overallScore >= 60 ? 0.5 : 0.2} />
          <circle cx="103" cy="80" r="5" fill="#f9a8d4" fillOpacity={overallScore !== null && overallScore >= 60 ? 0.5 : 0.2} />

          {/* 8. Accessories */}
          {/* Sparkles when overall > 80 */}
          {overallScore !== null && overallScore > 80 && (
            <>
              <g style={{ animation: "sparkle-rotate 3s linear infinite" }}>
                <path d="M30 30 L32 26 L34 30 L38 32 L34 34 L32 38 L30 34 L26 32Z" fill="#fbbf24" fillOpacity="0.8" />
              </g>
              <g style={{ animation: "sparkle-rotate 3s linear infinite 1s" }}>
                <path d="M120 25 L122 21 L124 25 L128 27 L124 29 L122 33 L120 29 L116 27Z" fill="#fbbf24" fillOpacity="0.7" />
              </g>
              <g style={{ animation: "sparkle-rotate 3s linear infinite 2s" }}>
                <path d="M130 55 L131.5 52 L133 55 L136 56.5 L133 58 L131.5 61 L130 58 L127 56.5Z" fill="#fbbf24" fillOpacity="0.6" />
              </g>
            </>
          )}

          {/* Z-z-z when sleep < 40 */}
          {sleepQuality !== null && sleepQuality < 40 && (
            <>
              <text x="108" y="50" fontSize="10" fill="#6366f1" fontWeight="bold" style={{ animation: "float-zzz 2s ease-out infinite" }}>z</text>
              <text x="114" y="42" fontSize="8" fill="#6366f1" fontWeight="bold" style={{ animation: "float-zzz 2s ease-out 0.5s infinite" }}>z</text>
              <text x="118" y="35" fontSize="6" fill="#6366f1" fontWeight="bold" style={{ animation: "float-zzz 2s ease-out 1s infinite" }}>z</text>
            </>
          )}

          {/* Sweat drop when stress > 70 */}
          {stressLevel !== null && stressLevel > 70 && (
            <g style={{ animation: "sweat-drop 2s ease-in infinite" }}>
              <path d="M110 58 Q112 62 110 66 Q108 62 110 58Z" fill="#93c5fd" fillOpacity="0.8" />
            </g>
          )}

          {/* Hair shimmer when hair > 80 */}
          {hairHealth !== null && hairHealth > 80 && (
            <ellipse cx="75" cy="38" rx="6" ry="3" fill="white" fillOpacity="0.35">
              <animate attributeName="fillOpacity" values="0.15;0.4;0.15" dur="2s" repeatCount="indefinite" />
            </ellipse>
          )}
        </svg>
      </div>
    </div>
  );
}
