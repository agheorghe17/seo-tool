'use client';

import { dismissToast, useToasts } from '@/lib/toast';

const TONE: Record<string, { icon: string; cls: string }> = {
  success: { icon: '✓', cls: 'border-[var(--good)] text-[var(--good)]' },
  error: { icon: '!', cls: 'border-[var(--bad)] text-[var(--bad)]' },
  info: { icon: 'i', cls: 'border-[var(--border-strong)] text-[var(--text-muted)]' },
};

export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,26rem)] flex-col gap-2">
      {toasts.map((t) => {
        const tone = TONE[t.tone] ?? TONE.info;
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-[var(--radius-sm)] border bg-[var(--surface)] px-4 py-3 text-sm shadow-lg animate-slide-up"
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${tone.cls}`}
            >
              {tone.icon}
            </span>
            <span className="min-w-0 flex-1 text-[var(--text)]">{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              className="text-[var(--text-faint)] hover:text-[var(--text)]"
              aria-label="Închide"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
