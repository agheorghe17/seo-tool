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

// Ordinea așteptată a pipeline-ului de strategie (fără `crawl`, care e separat).
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

function startKey(siteId: string) {
  return `pipeline:start:${siteId}`;
}

/** Marchează momentul „acum" ca început de pipeline (apelat când userul dă „Reface strategia"). */
export function markPipelineStart(siteId: string) {
  try {
    localStorage.setItem(startKey(siteId), String(Date.now()));
  } catch {
    /* localStorage indisponibil — timer-ul pur și simplu nu pornește */
  }
}

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

/**
 * Cronometru pentru pipeline: pornește de la stamp-ul scris de `markPipelineStart`
 * (sau se auto-repară când vede pipeline-ul „running"), ticăie din secundă în
 * secundă și îngheață pe „gata în mm:ss" la final.
 */
function usePipelineTimer(siteId: string, running: boolean) {
  const key = startKey(siteId);
  const [start, setStart] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [finalSec, setFinalSec] = useState<number | null>(null);
  const wasRunning = useRef(false);

  // La montare: adoptă un stamp existent doar dacă chiar rulează ceva;
  // altfel e o rămășiță de la o rulare încheiată → curăț.
  useEffect(() => {
    let v: string | null = null;
    try {
      v = localStorage.getItem(key);
    } catch {
      /* ignore */
    }
    if (!v) return;
    if (running) {
      setStart(Number(v));
    } else {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    // doar la montare
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-reparare: pipeline-ul rulează dar n-avem stamp (refresh în timpul rulării
  // sau rebuild pornit din altă parte) → pornește de acum.
  useEffect(() => {
    if (!running) return;
    wasRunning.current = true;
    setFinalSec(null);
    setStart((s) => {
      if (s != null) return s;
      const t = Date.now();
      try {
        localStorage.setItem(key, String(t));
      } catch {
        /* ignore */
      }
      return t;
    });
  }, [running, key]);

  // Tick cât timp numărăm.
  useEffect(() => {
    if (start == null || finalSec != null) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [start, finalSec]);

  // Final: a rulat și acum s-a oprit → îngheață valoarea, apoi curăță după 90s.
  useEffect(() => {
    if (running || start == null || finalSec != null || !wasRunning.current) return;
    setFinalSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    const id = setTimeout(() => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      setStart(null);
      setFinalSec(null);
      wasRunning.current = false;
    }, 90_000);
    return () => clearTimeout(id);
  }, [running, start, finalSec, key]);

  // Plasă de siguranță: stamp vechi (>25 min) fără nimic în rulare → renunță.
  useEffect(() => {
    if (start == null || finalSec != null || running) return;
    if (Date.now() - start <= 25 * 60_000) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setStart(null);
  }, [start, finalSec, running, nowTs, key]);

  if (start == null) return null;
  return {
    elapsed: finalSec ?? Math.max(0, Math.floor((nowTs - start) / 1000)),
    done: finalSec != null,
  };
}

function StepPill({ type, st, muted }: { type: string; st?: PipelineStep; muted: 'pending' | 'skipped' | null }) {
  const label = LABEL[type] ?? type;

  if (st?.status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium bg-[var(--warn-soft)] text-[var(--warn)]">
        <Spinner className="text-[var(--warn)]" /> {label}
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
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--good)]">
        <span aria-hidden>✓</span> {label}
      </span>
    );
  }
  // pas absent din răspuns
  if (muted === 'skipped') {
    return (
      <span
        title="nu s-a rulat (ex.: fără Search Console conectat sau fără competitori adăugați)"
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
  const { data } = usePipeline(siteId, true);
  const running = !!data?.running;
  const timer = usePipelineTimer(siteId, running);

  if (!data || (data.steps.length === 0 && !timer)) return null;

  const present = new Map(data.steps.map((s) => [s.type, s]));
  const seq = present.has('crawl') ? ['crawl', ...CANON] : CANON;
  // ultimul pas care a terminat cu succes — pașii absenți dinaintea lui = „sărit"
  const lastOkIdx = seq.reduce((acc, t, i) => (present.get(t)?.status === 'ok' ? i : acc), -1);
  const failed = data.steps.find((s) => s.status === 'failed');

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
      <span className="inline-flex items-center gap-1.5">
        {running ? (
          <>
            <Spinner className="text-[var(--warn)]" />
            <span className="font-medium text-[var(--warn)]">Se procesează</span>
          </>
        ) : timer?.done ? (
          <span className="font-medium text-[var(--good)]">✓ Gata</span>
        ) : (
          <span className="font-medium text-[var(--text-muted)]">Pipeline</span>
        )}
        {timer && (
          <span className={`tabular-nums ${timer.done ? 'text-[var(--good)]' : 'text-[var(--warn)]'}`}>
            {timer.done ? `în ${mmss(timer.elapsed)}` : `· ${mmss(timer.elapsed)}`}
          </span>
        )}
      </span>

      <span className="h-3 w-px bg-[var(--border)]" aria-hidden />

      {seq.map((type, i) => (
        <StepPill
          key={type}
          type={type}
          st={present.get(type)}
          muted={present.has(type) ? null : !running && i < lastOkIdx ? 'skipped' : 'pending'}
        />
      ))}

      {failed && <span className="text-[var(--bad)]">— {failed.error?.slice(0, 80)}</span>}
    </div>
  );
}
