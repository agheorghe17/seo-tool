'use client';

import { useState, type ReactNode } from 'react';
import { CategoryTag, Dots } from './ui';
import type { HomeTask } from '@/lib/home';

function statusChip(status: HomeTask['status']) {
  if (status === 'done')
    return <span className="text-xs font-medium text-[var(--good)]">✓ Gata</span>;
  if (status === 'doing')
    return <span className="text-xs font-medium text-[var(--warn)]">În lucru</span>;
  return null;
}

export function TaskCard({
  task,
  actions,
  defaultOpen = false,
  emphasis = false,
}: {
  task: HomeTask;
  actions?: ReactNode;
  defaultOpen?: boolean;
  emphasis?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const done = task.status === 'done';

  return (
    <div
      className={`rounded-[var(--radius-sm)] border bg-[var(--surface)] transition ${
        emphasis
          ? 'border-[var(--accent)] shadow-sm'
          : 'border-[var(--border)] hover:border-[var(--border-strong)]'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px]"
          style={{
            borderColor: done ? 'var(--good)' : 'var(--border-strong)',
            background: done ? 'var(--good)' : 'transparent',
            color: done ? '#fff' : 'transparent',
          }}
          aria-hidden
        >
          ✓
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block font-medium ${done ? 'text-[var(--text-faint)] line-through' : ''}`}
          >
            {task.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            <CategoryTag category={task.category} />
            <span className="inline-flex items-center gap-1">
              impact <Dots n={task.impact} />
            </span>
            <span className="inline-flex items-center gap-1">
              efort <Dots n={task.effort} tone="muted" />
            </span>
            {task.phase && <span>· {task.phase} zile</span>}
            {statusChip(task.status)}
          </span>
        </span>
        <span className="mt-1 text-[var(--text-faint)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-4 py-3 text-sm animate-slide-up">
          {task.why && <p className="text-[var(--text-muted)]">{task.why}</p>}
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
