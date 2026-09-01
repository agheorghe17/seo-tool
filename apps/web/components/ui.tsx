import type { ReactNode } from 'react';

/* ---- Surfaces ----------------------------------------------------------- */

export function Card({
  children,
  className = '',
  as: As = 'div',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
  onClick?: () => void;
}) {
  return (
    <As
      onClick={onClick}
      className={`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 ${className}`}
    >
      {children}
    </As>
  );
}

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {children}
      </h2>
      {hint && <span className="text-xs text-[var(--text-faint)]">{hint}</span>}
    </div>
  );
}

/* ---- Badge / Chip ----------------------------------------------------------- */

const TONE_STYLES: Record<string, string> = {
  critical: 'bg-[var(--bad-soft)] text-[var(--bad)]',
  warning: 'bg-[var(--warn-soft)] text-[var(--warn)]',
  info: 'bg-[var(--accent-soft)] text-[var(--accent-text)]',
  neutral: 'bg-[var(--surface-2)] text-[var(--text-muted)]',
  good: 'bg-[var(--good-soft)] text-[var(--good)]',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof TONE_STYLES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        TONE_STYLES[tone] ?? TONE_STYLES.neutral
      }`}
    >
      {children}
    </span>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)] font-medium'
          : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
      }`}
    >
      {children}
    </button>
  );
}

/* ---- Button ----------------------------------------------------------------- */

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden
    />
  );
}

export function Button({
  children,
  onClick,
  disabled,
  loading,
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  className?: string;
}) {
  const styles = {
    primary: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
    ghost:
      'border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)]',
    subtle: 'bg-[var(--surface-2)] text-[var(--text)] hover:brightness-95',
    danger: 'bg-[var(--bad)] text-white hover:brightness-110',
  }[variant];
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${styles} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/* ---- Score gauge (SVG ring) ---------------------------------------------- */

export function Gauge({
  score,
  size = 132,
  label,
  delta,
}: {
  score: number | null | undefined;
  size?: number;
  label?: string;
  delta?: number | null;
}) {
  const v = score == null ? 0 : Math.max(0, Math.min(100, Math.round(score)));
  const stroke = size < 90 ? 8 : 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color =
    score == null
      ? 'var(--text-faint)'
      : v >= 80
        ? 'var(--good)'
        : v >= 50
          ? 'var(--warn)'
          : 'var(--bad)';
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-semibold tabular-nums" style={{ color }}>
          {score == null ? '—' : v}
        </div>
        {label && <div className="text-[11px] text-[var(--text-muted)]">{label}</div>}
        {delta != null && delta !== 0 && (
          <div
            className={`text-[11px] font-medium ${delta > 0 ? 'text-[var(--good)]' : 'text-[var(--bad)]'}`}
          >
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Progress + XP ------------------------------------------------------- */

export function ProgressBar({
  value,
  tone = 'accent',
}: {
  value: number; // 0..1
  tone?: 'accent' | 'good';
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const bg = tone === 'good' ? 'var(--good)' : 'var(--accent)';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: bg, transition: 'width 0.5s ease' }}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const color =
    tone === 'good'
      ? 'text-[var(--good)]'
      : tone === 'warn'
        ? 'text-[var(--warn)]'
        : tone === 'bad'
          ? 'text-[var(--bad)]'
          : '';
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--text-faint)]">{sub}</div>}
    </div>
  );
}

/** Impact / effort dots. */
export function Dots({ n, max = 5, tone = 'accent' }: { n: number; max?: number; tone?: 'accent' | 'muted' }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background:
              i < n
                ? tone === 'muted'
                  ? 'var(--text-muted)'
                  : 'var(--accent)'
                : 'var(--surface-2)',
          }}
        />
      ))}
    </span>
  );
}

/* ---- Drawer / Sheet ---------------------------------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-xl animate-slide-up">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div className="font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
          >
            Închide
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/* ---- States -------------------------------------------------------------- */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-2)] ${className}`} />;
}

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-10 text-center">
      {icon && <div className="mb-3 text-3xl">{icon}</div>}
      <p className="font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--text-muted)]">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-[var(--radius)] border border-[var(--bad)] bg-[var(--bad-soft)] p-5 text-sm text-[var(--bad)]">
      {msg}
    </div>
  );
}

export function scoreTone(score: number | null | undefined): keyof typeof TONE_STYLES {
  if (score == null) return 'neutral';
  if (score >= 80) return 'good';
  if (score >= 50) return 'warning';
  return 'critical';
}

/* ---- Category iconography --------------------------------------------------- */

export const CATEGORY_META: Record<string, { icon: string; label: string }> = {
  technical: { icon: '🔧', label: 'Tehnic' },
  cwv: { icon: '⚡', label: 'Viteză' },
  onpage: { icon: '📝', label: 'Pe pagină' },
  content: { icon: '✍️', label: 'Conținut' },
  geo: { icon: '🤖', label: 'Vizibilitate AI' },
  keyword: { icon: '🎯', label: 'Cuvinte cheie' },
  roadmap: { icon: '🗺️', label: 'Plan' },
};

export function CategoryTag({ category }: { category: string }) {
  const m = CATEGORY_META[category] ?? { icon: '•', label: category };
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </span>
  );
}
