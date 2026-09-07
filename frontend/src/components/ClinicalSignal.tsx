import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

/**
 * Shared semantic states for clinical measurements. The labels are intentionally
 * descriptive rather than diagnostic so they can be used for both wellness and
 * care-plan UI.
 */
export type ClinicalSignalStatus =
  | "optimal"
  | "stable"
  | "monitor"
  | "attention"
  | "critical"
  | "neutral";

export type ClinicalSignalSize = "sm" | "md" | "lg";

export type ClinicalTrendDirection = "up" | "down" | "steady";

export interface ClinicalTrend {
  /** A short, contextual comparison such as "4% from last week". */
  label: string;
  direction?: ClinicalTrendDirection;
}

export interface ClinicalStatusChipProps
  extends Omit<ComponentPropsWithoutRef<"span">, "children" | "className"> {
  status?: ClinicalSignalStatus;
  /** Overrides the default status copy, e.g. "In range". */
  label?: string;
  className?: string;
}

export interface ClinicalMetricRingProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children" | "className"> {
  /** Current measurement. Values outside the range are safely clamped visually. */
  value: number;
  /** Highest value on the measurement's scale. Defaults to 100. */
  max?: number;
  /** Custom visual center content. Defaults to the value plus optional unit. */
  valueLabel?: ReactNode;
  unit?: string;
  status?: ClinicalSignalStatus;
  size?: ClinicalSignalSize;
  className?: string;
}

export interface ClinicalSignalProps
  extends Omit<ComponentPropsWithoutRef<"section">, "children" | "className"> {
  label: string;
  value: number;
  max?: number;
  unit?: string;
  /** Use this when a score needs a different display format than its numeric value. */
  valueLabel?: ReactNode;
  status?: ClinicalSignalStatus;
  statusLabel?: string;
  description?: string;
  trend?: ClinicalTrend;
  icon?: ReactNode;
  ringSize?: ClinicalSignalSize;
  /** Removes the circular visual when a compact, list-like metric is needed. */
  showRing?: boolean;
  className?: string;
}

type SignalPalette = {
  label: string;
  accent: string;
  soft: string;
  chip: string;
  dot: string;
};

const STATUS_PALETTES: Record<ClinicalSignalStatus, SignalPalette> = {
  optimal: {
    label: "Optimal",
    accent: "#14b8a6",
    soft: "rgba(20, 184, 166, 0.14)",
    chip: "bg-teal-50 text-teal-700 ring-teal-600/15 dark:bg-teal-400/10 dark:text-teal-200 dark:ring-teal-300/20",
    dot: "bg-teal-500",
  },
  stable: {
    label: "Stable",
    accent: "#0ea5e9",
    soft: "rgba(14, 165, 233, 0.14)",
    chip: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-300/20",
    dot: "bg-sky-500",
  },
  monitor: {
    label: "Monitor",
    accent: "#f59e0b",
    soft: "rgba(245, 158, 11, 0.14)",
    chip: "bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-300/20",
    dot: "bg-amber-500",
  },
  attention: {
    label: "Needs attention",
    accent: "#f97316",
    soft: "rgba(249, 115, 22, 0.14)",
    chip: "bg-orange-50 text-orange-800 ring-orange-600/15 dark:bg-orange-400/10 dark:text-orange-100 dark:ring-orange-300/20",
    dot: "bg-orange-500",
  },
  critical: {
    label: "Priority",
    accent: "#ef4444",
    soft: "rgba(239, 68, 68, 0.14)",
    chip: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-400/10 dark:text-red-100 dark:ring-red-300/20",
    dot: "bg-red-500",
  },
  neutral: {
    label: "No baseline",
    accent: "#64748b",
    soft: "rgba(100, 116, 139, 0.13)",
    chip: "bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-white/10 dark:text-slate-200 dark:ring-white/15",
    dot: "bg-slate-400",
  },
};

const RING_SIZES: Record<ClinicalSignalSize, { box: string; value: string; unit: string }> = {
  sm: { box: "h-20 w-20", value: "text-lg", unit: "text-[9px]" },
  md: { box: "h-28 w-28", value: "text-2xl", unit: "text-[10px]" },
  lg: { box: "h-36 w-36", value: "text-3xl", unit: "text-xs" },
};

const CIRCLE_RADIUS = 44;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getPalette(status: ClinicalSignalStatus = "stable") {
  return STATUS_PALETTES[status];
}

function getProgress(value: number, max: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  return Math.min(1, Math.max(0, safeValue / safeMax));
}

function getDefaultValueLabel(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

/** Compact, accessible status indicator for a clinical measurement. */
export function ClinicalStatusChip({
  status = "stable",
  label,
  className,
  ...props
}: ClinicalStatusChipProps) {
  const palette = getPalette(status);

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] ring-1 ring-inset",
        palette.chip,
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={classNames("h-1.5 w-1.5 rounded-full shadow-[0_0_0_3px_rgba(255,255,255,0.55)] dark:shadow-[0_0_0_3px_rgba(15,23,42,0.7)]", palette.dot)} />
      {label ?? palette.label}
    </span>
  );
}

/**
 * A circular measurement visual with semantic status color. It has no client
 * dependencies, so it can be rendered in either Server or Client Components.
 */
export function ClinicalMetricRing({
  value,
  max = 100,
  valueLabel,
  unit,
  status = "stable",
  size = "md",
  className,
  ...props
}: ClinicalMetricRingProps) {
  const palette = getPalette(status);
  const progress = getProgress(value, max);
  const dashOffset = CIRCLE_CIRCUMFERENCE * (1 - progress);
  const ringSize = RING_SIZES[size];
  const ringStyle = {
    "--clinical-signal-accent": palette.accent,
    "--clinical-signal-soft": palette.soft,
  } as CSSProperties;

  return (
    <div
      className={classNames("relative shrink-0", ringSize.box, className)}
      style={ringStyle}
      {...props}
    >
      <div
        aria-hidden="true"
        className="absolute inset-[10%] rounded-full blur-xl"
        style={{ background: "var(--clinical-signal-soft)" }}
      />
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full -rotate-90"
        viewBox="0 0 120 120"
        fill="none"
      >
        <circle cx="60" cy="60" r={CIRCLE_RADIUS} stroke="currentColor" strokeOpacity="0.09" strokeWidth="8" className="text-slate-900 dark:text-white" />
        <circle
          cx="60"
          cy="60"
          r={CIRCLE_RADIUS}
          stroke="var(--clinical-signal-accent)"
          strokeLinecap="round"
          strokeWidth="8"
          strokeDasharray={CIRCLE_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
        <circle cx="60" cy="16" r="2" fill="var(--clinical-signal-accent)" opacity={progress > 0 ? 1 : 0} />
      </svg>
      <div className="relative flex h-full w-full flex-col items-center justify-center px-2 text-center">
        <span className={classNames("font-bold tracking-[-0.06em] text-slate-900 dark:text-white", ringSize.value)}>
          {valueLabel ?? getDefaultValueLabel(value)}
        </span>
        {unit && <span className={classNames("mt-0.5 font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500", ringSize.unit)}>{unit}</span>}
      </div>
    </div>
  );
}

/**
 * A complete clinical metric card: status, metric ring, context, and optional
 * trend. Suitable for dashboard cards, scan results, and care-plan summaries.
 */
export default function ClinicalSignal({
  label,
  value,
  max = 100,
  unit,
  valueLabel,
  status = "stable",
  statusLabel,
  description,
  trend,
  icon,
  ringSize = "md",
  showRing = true,
  className,
  ...props
}: ClinicalSignalProps) {
  const palette = getPalette(status);
  const metricLabel = typeof valueLabel === "string" || typeof valueLabel === "number"
    ? String(valueLabel)
    : getDefaultValueLabel(value);
  const accessibleMetric = `${label}: ${metricLabel}${unit ? ` ${unit}` : ""}. ${statusLabel ?? palette.label}.`;

  return (
    <section
      aria-label={accessibleMetric}
      className={classNames(
        "group relative isolate overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white/80 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] backdrop-blur-xl transition-shadow duration-300 hover:shadow-[0_22px_55px_rgba(14,165,233,0.12)] dark:border-white/10 dark:bg-slate-950/70",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl opacity-70"
        style={{ background: palette.soft }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon && (
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
                style={{ background: palette.soft, color: palette.accent }}
              >
                {icon}
              </span>
            )}
            <p className="truncate text-sm font-semibold tracking-[-0.015em] text-slate-900 dark:text-white">{label}</p>
          </div>
          {description && <p className="mt-1.5 max-w-[17rem] text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        <ClinicalStatusChip status={status} label={statusLabel} />
      </div>

      <div className={classNames("relative mt-4 flex items-center", showRing ? "gap-4" : "gap-3")}>
        {showRing ? (
          <ClinicalMetricRing
            value={value}
            max={max}
            unit={unit}
            valueLabel={valueLabel}
            status={status}
            size={ringSize}
          />
        ) : (
          <div>
            <p className="text-3xl font-bold tracking-[-0.06em] text-slate-900 dark:text-white">{valueLabel ?? getDefaultValueLabel(value)}</p>
            {unit && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{unit}</p>}
          </div>
        )}
        {trend && (
          <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs dark:border-white/8 dark:bg-white/5">
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              <span aria-hidden="true" className={classNames("mr-1", trend.direction === "up" && "text-teal-600", trend.direction === "down" && "text-orange-500", trend.direction === "steady" && "text-slate-400")}>
                {trend.direction === "up" ? "↗" : trend.direction === "down" ? "↘" : "—"}
              </span>
              {trend.label}
            </p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">Trend signal</p>
          </div>
        )}
      </div>
    </section>
  );
}
