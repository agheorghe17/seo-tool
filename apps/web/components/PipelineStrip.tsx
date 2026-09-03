'use client';

import { useEffect, useRef, useState } from 'react';
import { usePipeline, type PipelineStep } from '@/lib/home';
import { Spinner } from './ui';

const LABEL: Record<string, string> = {
  crawl: 'scan',
  'profile-extract': 'profil',
  'keyword-research': 'cuvinte cheie',
  'rank-import': 'poziții',
  'competitor-crawl': 'competitori',
  'strategy-build': 'strategie',
  'page-plan': 'plan pe pagini',
  'traffic-history': 'istoric trafic',
  estimate: 'proiecție',
};

// Expected order of the strategy pipeline (crawl is separate).
const CANON = [
  'profile-extract',
  'keyword-research',
  'rank-import',
  'competitor-crawl',
  'strategy-build',
  'page-plan',
  'traffic-history',
  'estimate',
];

const START_KEY = (siteId: string) => `pipeline:start:${siteId}`;
const DONE_KEY = (siteId: string) => `pipeline:done:${siteId}`;
const DONE_TTL = 3 * 60_000;
const STALE_MS = 20 * 60_000;

/** Mark the moment the user kicked off a run — timer + step scoping both key off this. */
export function markPipelineStart(siteId: string) {
  try {
    localStorage.setItem(START_KEY(siteId), String(Date.now()));
    localStorage.removeItem(DONE_KEY(siteId));
  } catch {
    /* localStorage unavailable — the timer just won't run */
  }
}

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

interface DoneStamp {
  sec: number;
  at: number;
  since: string;
}

/**
 * Elapsed timer that survives a page refresh: it reads a persisted start stamp and
 * never resets it just because the poll hasn't reported `running` yet. On completion
 * it freezes as a "done" stamp for a few minutes.
 */
function usePipelineTimer(siteId: string, running: boolean, anyOk: boolean) {
  const [start, setStart] = useState<number | null>(null);
  const [done, setDone] = useState<DoneStamp | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const sawRunning = useRef(false);

  // Mount: adopt whatever is persisted. Do NOT clear on a transient !running.
  useEffect(() => {
    try {
      const s = localStorage.getItem(START_KEY(siteId));
      if (s) setStart(Number(s));
      const d = localStorage.getItem(DONE_KEY(siteId));
      if (d) {
        const parsed = JSON.parse(d) as DoneStamp;
        if (Date.now() - parsed.at < DONE_TTL) setDone(parsed);
        else localStorage.removeItem(DONE_KEY(siteId));
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // While the pipeline is running: remember it, drop any stale "done", self-heal a
  // missing start stamp (refresh mid-run, or a run triggered elsewhere).
  useEffect(() => {
    if (!running) return;
    sawRunning.current = true;
    setDone(null);
    try {
      localStorage.removeItem(DONE_KEY(siteId));
    } catch {
      /* ignore */
    }
    setStart((s) => {
      if (s != null) return s;
      const t = Date.now();
      try {
        localStorage.setItem(START_KEY(siteId), String(t));
      } catch {
        /* ignore */
      }
      return t;
    });
  }, [running, siteId]);

  // Completion: pipeline idle again, we saw it run (or the stamp is old enough that
  // the whole chain finished between two polls), and at least one step is ok.
  useEffect(() => {
    if (running || start == null || done != null || !anyOk) return;
    if (!sawRunning.current && Date.now() - start < 12_000) return;
    const stamp: DoneStamp = {
      sec: Math.max(0, Math.floor((Date.now() - start) / 1000)),
      at: Date.now(),
      since: new Date(start - 3000).toISOString(),
    };
    try {
      localStorage.setItem(DONE_KEY(siteId), JSON.stringify(stamp));
      localStorage.removeItem(START_KEY(siteId));
    } catch {
      /* ignore */
    }
    setDone(stamp);
    setStart(null);
    sawRunning.current = false;
  }, [running, start, done, anyOk, siteId]);

  // Stale guard: a start stamp with nothing running for 20 min → give up on it.
  useEffect(() => {
    if (start == null || done != null || running) return;
    if (Date.now() - start <= STALE_MS) return;
    try {
      localStorage.removeItem(START_KEY(siteId));
    } catch {
      /* ignore */
    }
    setStart(null);
  }, [start, done, running, nowTs, siteId]);

  // Tick while counting; also expire the "done" stamp.
  useEffect(() => {
    if (start == null && done == null) return;
    const id = setInterval(() => {
      setNowTs(Date.now());
      if (done && Date.now() - done.at > DONE_TTL) {
        setDone(null);
        try {
          localStorage.removeItem(DONE_KEY(siteId));
        } catch {
          /* ignore */
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [start, done, siteId]);

  if (start != null) {
    return {
      phase: 'running' as const,
      elapsed: Math.max(0, Math.floor((nowTs - start) / 1000)),
      sinceIso: new Date(start - 3000).toISOString(),
    };
  }
  if (done != null) {
    return { phase: 'done' as const, elapsed: done.sec, sinceIso: done.since };
  }
  return null;
}

function StepPill({
  type,
  st,
  muted,
}: {
  type: string;
  st?: PipelineStep;
  muted: 'pending' | 'skipped' | null;
}) {
  const label = LABEL[type] ?? type;

  if (st?.status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium bg-[var(--warn-soft)] text-[var(--warn)]">
        <Spinner className="text-[var(--warn)]" /> {label}
        {st.attempts > 1 && <span className="opacity-70">· încercarea {st.attempts}</span>}
      </span>
    );
  }
  if (st?.status === 'failed') {
    return (
      <span
        title={st.error ?? undefined}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--bad)]"
      >
        <span aria-hidden>✕</span> {label}
      </span>
    );
  }
  if (st?.status === 'ok') {
    return (
      <span
        title={st.durationMs != null ? `${(st.durationMs / 1000).toFixed(1)}s` : undefined}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--good)]"
      >
        <span aria-hidden>✓</span> {label}
      </span>
    );
  }
  if (muted === 'skipped') {
    return (
      <span
        title="nu s-a rulat (ex.: fără Search Console sau fără competitori adăugați)"
        className="inline-flex items-center gap-1 text-[var(--text-muted)] line-through opacity-40"
      >
        <span aria-hidden>–</span> {label}
      </span>
    );
  }
  return (
    <span
      title="în așteptare"
      className="inline-flex items-center gap-1 text-[var(--text-muted)] opacity-55"
    >
      <span aria-hidden>○</span> {label}
    </span>
  );
}

export function PipelineStrip({ siteId }: { siteId: string }) {
  // First read (no since) to know whether anything is running right now.
  const probe = usePipeline(siteId, true);
  const running = !!probe.data?.running;
  const anyOkProbe = (probe.data?.steps ?? []).some((s) => s.status === 'ok');
  const timer = usePipelineTimer(siteId, running, anyOkProbe);

  // When a run is in flight / just finished, scope the strip to that run so old
  // rows can't flip finished steps back to "running".
  const scoped = usePipeline(siteId, true, timer?.sinceIso ?? null);
  const data = timer ? scoped.data : probe.data;

  if (!data || (data.steps.length === 0 && !timer)) return null;

  const present = new Map(data.steps.map((s) => [s.type, s]));
  const seq = present.has('crawl') ? ['crawl', ...CANON] : CANON;
  const lastOkIdx = seq.reduce((acc, t, i) => (present.get(t)?.status === 'ok' ? i : acc), -1);
  const failed = data.steps.find((s) => s.status === 'failed');
  const liveRunning = data.steps.some((s) => s.status === 'running');

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
      <span className="inline-flex items-center gap-1.5">
        {liveRunning || timer?.phase === 'running' ? (
          <>
            <Spinner className="text-[var(--warn)]" />
            <span className="font-medium text-[var(--warn)]">Se procesează</span>
          </>
        ) : timer?.phase === 'done' ? (
          <span className="font-medium text-[var(--good)]">✓ Gata</span>
        ) : (
          <span className="font-medium text-[var(--text-muted)]">Pipeline</span>
        )}
        {timer && (
          <span
            className={`tabular-nums ${
              timer.phase === 'done' ? 'text-[var(--good)]' : 'text-[var(--warn)]'
            }`}
          >
            {timer.phase === 'done' ? `în ${mmss(timer.elapsed)}` : `· ${mmss(timer.elapsed)}`}
          </span>
        )}
      </span>

      <span className="h-3 w-px bg-[var(--border)]" aria-hidden />

      {seq.map((type, i) => (
        <StepPill
          key={type}
          type={type}
          st={present.get(type)}
          muted={present.has(type) ? null : i < lastOkIdx ? 'skipped' : 'pending'}
        />
      ))}

      {failed && <span className="text-[var(--bad)]">— {failed.error?.slice(0, 100)}</span>}
    </div>
  );
}
