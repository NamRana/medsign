"use client";

interface HealthAuraProps {
  score: number;
  children?: React.ReactNode;
}

function getAuraColors(score: number) {
  if (score >= 80) {
    return {
      primary: "rgba(16, 185, 129, 0.6)",    // emerald
      secondary: "rgba(234, 179, 8, 0.4)",    // gold
      tertiary: "rgba(5, 150, 105, 0.3)",     // deep emerald
      particle: "rgba(16, 185, 129, 0.7)",
      glow: "rgba(16, 185, 129, 0.15)",
    };
  }
  if (score >= 60) {
    return {
      primary: "rgba(59, 130, 246, 0.5)",     // blue
      secondary: "rgba(20, 184, 166, 0.4)",   // teal
      tertiary: "rgba(99, 102, 241, 0.3)",    // indigo
      particle: "rgba(59, 130, 246, 0.6)",
      glow: "rgba(59, 130, 246, 0.12)",
    };
  }
  if (score >= 40) {
    return {
      primary: "rgba(245, 158, 11, 0.5)",     // amber
      secondary: "rgba(249, 115, 22, 0.35)",  // orange
      tertiary: "rgba(234, 179, 8, 0.3)",     // yellow
      particle: "rgba(245, 158, 11, 0.6)",
      glow: "rgba(245, 158, 11, 0.1)",
    };
  }
  return {
    primary: "rgba(139, 92, 246, 0.4)",       // purple
    secondary: "rgba(107, 114, 128, 0.35)",   // gray
    tertiary: "rgba(167, 139, 250, 0.25)",    // light purple
    particle: "rgba(139, 92, 246, 0.5)",
    glow: "rgba(139, 92, 246, 0.08)",
  };
}

const PARTICLE_COUNT = 7;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  id: i,
  size: 3 + (i % 3) * 0.8,
  delay: i * (4 / PARTICLE_COUNT),
  startAngle: (360 / PARTICLE_COUNT) * i + (i % 2) * 12,
  distance: 62 + (i % 4) * 8,
}));

export default function HealthAura({ score, children }: HealthAuraProps) {
  const colors = getAuraColors(score);

  return (
    <div className="relative w-48 h-48 sm:w-48 sm:h-48 flex items-center justify-center" style={{ overflow: "visible" }}>
      <style>{`
        @keyframes aura-breathe {
          0%, 100% {
            transform: scale(1);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.08);
            opacity: 1;
          }
        }

        @keyframes aura-glow {
          0%, 100% {
            transform: scale(1.1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.25);
            opacity: 0.3;
          }
        }

        @keyframes aura-rotate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes particle-drift {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          85% {
            opacity: 0.6;
          }
          100% {
            transform: translate(var(--dx), var(--dy)) scale(0.3);
            opacity: 0;
          }
        }
      `}</style>

      {/* Background glow layer - large, blurred */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-1000 ease-in-out"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${colors.glow}, transparent 70%)`,
          transform: "scale(1.6)",
          filter: "blur(20px)",
          animation: "aura-glow 5s ease-in-out infinite",
          willChange: "transform, opacity",
        }}
      />

      {/* Mid layer - pulsing gradient blob */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-1000 ease-in-out"
        style={{
          background: `
            radial-gradient(ellipse at 30% 30%, ${colors.primary}, transparent 60%),
            radial-gradient(ellipse at 70% 70%, ${colors.secondary}, transparent 60%),
            radial-gradient(ellipse at 50% 50%, ${colors.tertiary}, transparent 50%)
          `,
          animation: "aura-breathe 4s ease-in-out infinite",
          filter: "blur(8px)",
          willChange: "transform, opacity",
        }}
      />

      {/* Secondary rotating blob for organic feel */}
      <div
        className="absolute inset-2 rounded-full transition-all duration-1000 ease-in-out"
        style={{
          background: `
            radial-gradient(ellipse at 60% 40%, ${colors.secondary}, transparent 55%),
            radial-gradient(ellipse at 40% 60%, ${colors.primary}, transparent 55%)
          `,
          animation: "aura-rotate 20s linear infinite, aura-breathe 4s ease-in-out infinite reverse",
          filter: "blur(12px)",
          opacity: 0.6,
          willChange: "transform, opacity",
        }}
      />

      {/* Floating particles */}
      {PARTICLES.map((p) => {
        const rad = (p.startAngle * Math.PI) / 180;
        const dx = Math.cos(rad) * p.distance;
        const dy = Math.sin(rad) * p.distance;
        return (
          <div
            key={p.id}
            className="absolute rounded-full transition-colors duration-1000"
            style={{
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: colors.particle,
              top: "50%",
              left: "50%",
              marginTop: `-${p.size / 2}px`,
              marginLeft: `-${p.size / 2}px`,
              "--dx": `${dx}px`,
              "--dy": `${dy}px`,
              animation: `particle-drift 4s ease-in-out ${p.delay}s infinite`,
              willChange: "transform, opacity",
            } as React.CSSProperties}
          />
        );
      })}

      {/* Center content slot */}
      <div className="relative z-10 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
