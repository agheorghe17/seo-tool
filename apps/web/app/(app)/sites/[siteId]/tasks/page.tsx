'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTasks, type HomeTask } from '@/lib/home';
import { useUpdateRoadmapItem } from '@/lib/strategy';
import { Button, Chip, EmptyState, ErrorState, ProgressBar, Skeleton } from '@/components/ui';
import { TaskCard } from '@/components/TaskCard';
import { KeywordDetail } from '@/components/strategy/KeywordDetail';

const FILTERS: { id: string; label: string; test: (t: HomeTask) => boolean }[] = [
  { id: 'all', label: 'Toate', test: () => true },
  { id: 'quick', label: '⚡ Câștiguri rapide', test: (t) => t.bucket === 'quick_win' },
  { id: 'technical', label: '🔧 Tehnic', test: (t) => t.category === 'technical' || t.category === 'cwv' },
  { id: 'onpage', label: '📝 Pe pagină', test: (t) => t.category === 'onpage' },
  { id: 'content', label: '✍️ Conținut', test: (t) => t.category === 'content' || t.category === 'keyword' },
  { id: 'geo', label: '🤖 Vizibilitate AI', test: (t) => t.category === 'geo' },
  { id: 'roadmap', label: '🗺️ Plan', test: (t) => t.category === 'roadmap' },
];

export default function TasksPage() {
  const siteId = useParams().siteId as string;
  const { data, isLoading, error } = useTasks(siteId);
  const updateRoadmap = useUpdateRoadmapItem(siteId);
  const [filter, setFilter] = useState('all');
  const [showDone, setShowDone] = useState(false);
  const [detailKw, setDetailKw] = useState<string | null>(null);

  const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0]!;
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const visible = useMemo(
    () => tasks.filter((t) => f.test(t) && (showDone || t.status !== 'done')),
    [tasks, f, showDone],
  );
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const progress = tasks.length ? doneCount / tasks.length : 0;

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sarcini</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Tot ce ai de făcut, într-o singură listă, ordonat după impact. Fără jargon.
        </p>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-[var(--text-muted)]">
          <span>
            {doneCount} din {tasks.length} rezolvate
          </span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <ProgressBar value={progress} tone="good" />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((x) => {
          const count = tasks.filter((t) => x.test(t) && t.status !== 'done').length;
          if (x.id !== 'all' && count === 0) return null;
          return (
            <Chip key={x.id} active={filter === x.id} onClick={() => setFilter(x.id)}>
              {x.label}
              {x.id !== 'all' && <span className="ml-1 opacity-60">{count}</span>}
            </Chip>
          );
        })}
        <button
          onClick={() => setShowDone((v) => !v)}
          className="ml-auto text-xs text-[var(--text-muted)] underline"
        >
          {showDone ? 'ascunde rezolvate' : `arată rezolvate (${doneCount})`}
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="✨"
          title="Nimic aici"
          hint="Nicio sarcină deschisă pe acest filtru. Încearcă alt filtru sau scanează din nou."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              actions={
                <TaskActions
                  siteId={siteId}
                  task={t}
                  onOpenKw={setDetailKw}
                  onToggleDone={(done) =>
                    updateRoadmap.mutate({
                      id: t.id.replace(/^rm:/, ''),
                      status: done ? 'done' : 'todo',
                    })
                  }
                />
              }
            />
          ))}
        </div>
      )}

      {detailKw && (
        <KeywordDetail siteId={siteId} kwId={detailKw} onClose={() => setDetailKw(null)} />
      )}
    </div>
  );
}

function TaskActions({
  siteId,
  task,
  onOpenKw,
  onToggleDone,
}: {
  siteId: string;
  task: HomeTask;
  onOpenKw: (id: string) => void;
  onToggleDone: (done: boolean) => void;
}) {
  if (task.kind === 'roadmap') {
    return (
      <Button
        size="sm"
        variant={task.status === 'done' ? 'ghost' : 'primary'}
        onClick={() => onToggleDone(task.status !== 'done')}
      >
        {task.status === 'done' ? 'Marchează nefăcut' : 'Marchează gata'}
      </Button>
    );
  }
  if (task.kind === 'keyword' && task.keywordId) {
    return (
      <Button size="sm" variant="ghost" onClick={() => onOpenKw(task.keywordId!)}>
        Deschide planul
      </Button>
    );
  }
  if (task.kind === 'fix' && task.pageId) {
    return (
      <Link href={`/pages/${task.pageId}`}>
        <Button size="sm" variant={task.autoFixable ? 'primary' : 'ghost'}>
          {task.autoFixable ? 'Rezolvă automat' : 'Vezi cum se face'}
        </Button>
      </Link>
    );
  }
  return null;
}
