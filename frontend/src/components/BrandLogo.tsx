import type { ComponentProps } from "react";

type BrandLogoProps = {
  iconClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
  compact?: boolean;
} & Omit<ComponentProps<"div">, "children">;

/** A single, responsive brand mark used throughout the product. */
export default function BrandLogo({
  iconClassName = "w-9 h-9",
  wordmarkClassName = "text-xl",
  showWordmark = true,
  compact = false,
  className = "",
  ...props
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`} {...props}>
      <svg
        aria-label="MedSign"
        role="img"
        className={`${iconClassName} shrink-0 drop-shadow-sm`}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="medsign-logo-bg" x1="6" y1="4" x2="43" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0F766E" />
            <stop offset="0.52" stopColor="#0D9488" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
          <linearGradient id="medsign-logo-pulse" x1="10" y1="18" x2="39" y2="31" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D1FAE5" />
            <stop offset="1" stopColor="#FFFFFF" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="15" fill="url(#medsign-logo-bg)" />
        <rect x="3.25" y="3.25" width="41.5" height="41.5" rx="12" stroke="white" strokeOpacity="0.18" strokeWidth="1.5" />
        <path d="M9.5 27H15L18.5 18.5L23 32L27.5 22.5L30.25 27H38.5" stroke="url(#medsign-logo-pulse)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="38.5" cy="27" r="2.25" fill="#A7F3D0" />
        <path d="M35.5 13.25L36.35 15.65L38.75 16.5L36.35 17.35L35.5 19.75L34.65 17.35L32.25 16.5L34.65 15.65L35.5 13.25Z" fill="white" fillOpacity="0.94" />
      </svg>
      {showWordmark && (
        <span className={`${wordmarkClassName} font-extrabold tracking-[-0.055em] leading-none whitespace-nowrap`}>
          <span className="text-slate-900">Med</span><span className="text-teal-600">Sign</span>
          {!compact && <sup className="ml-0.5 text-[0.38em] text-emerald-500 tracking-normal">AI</sup>}
        </span>
      )}
    </div>
  );
}
