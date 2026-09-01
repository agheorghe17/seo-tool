'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  useKeywords,
  useProfile,
  useStrategyOverview,
  type KeywordRow,
} from '@/lib/strategy';
import {
  Badge,
  Chip,
  EmptyState,
  ErrorState,
  Skeleton,
  Stat,
  scoreTone,
} from '@/components/ui';
import { ProfileWizard } from '@/components/strategy/ProfileWizard';
import { KeywordDetail } from '@/components/strategy/KeywordDetail';
import { SeoTermTooltip } from '@/components/strategy/SeoTermTooltip';
import { AnalysisNav } from '@/components/AnalysisNav';

const RANK_FILTERS = [
  { id: '', label: 'Toate' },
  { id: 'ranking', label: 'Rankez deja' },
  { id: 'striking', label: '⚡ Câștiguri rapide' },
  { id: 'gap', label: 'Fără pagină' },
];
const BUCKET_LABEL: Record<string, string> = {
  quick_win: 'câștig rapid',
  build_content: 'de creat',
  long_game: 'termen lung',
};

export default function KeywordsPage() {
  const siteId = useParams().siteId as string;
  const searchParams = useSearchParams();
  const profile = useProfile(siteId);
  const overview = useStrategyOverview(siteId);
  const [rank, setRank] = useState('');
  const [detailKw, setDetailKw] = useState<string | null>(null);
  const { data, isLoading, error } = useKeywords(siteId, { rank });

  useEffect(() => {
    const kw = searchParams.get('kw');
    if (kw) setDetailKw(kw);
  }, [searchParams]);

  const needsWizard = !profile.isLoading && (!profile.data || !profile.data.confirmedAt);

  if (needsWizard) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Cuvinte cheie</h1>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          Întâi ne spui pe scurt ce faci — apoi găsim automat cuvintele cheie potrivite.
        </p>
        <ProfileWizard siteId={siteId} onDone={() => profile.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analiză</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Pe ce te găsesc oamenii în Google și pe ce ai putea să apari.
        </p>
        <AnalysisNav siteId={siteId} active="keywords" />
      </div>

      {overview.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="În analiză" value={overview.data.keywords} />
          <Stat label="Rankezi pe" value={overview.data.ranking} />
          <Stat label="În top 10" value={overview.data.top10} tone="good" />
          <Stat
            label={<SeoTermTooltip term="striking distance">Câștiguri rapide</SeoTermTooltip>}
            value={overview.data.striking}
            tone="warn"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {RANK_FILTERS.map((x) => (
          <Chip key={x.id} active={rank === x.id} onClick={() => setRank(x.id)}>
            {x.label}
          </Chip>
        ))}
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {error && <ErrorState error={error} />}
      {data && data.keywords.length === 0 && (
        <EmptyState
          icon="🔍"
          title="Niciun cuvânt cheie încă"
          hint="Apasă „Reîmprospătează strategia” pe pagina Acasă ca să generăm universul de cuvinte cheie."
        />
      )}

      {data && data.keywords.length > 0 && (
        <div className="space-y-2">
          {data.keywords.map((k: KeywordRow) => (
            <button
              key={k.id}
              onClick={() => setDetailKw(k.id)}
              className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--border-strong)]"
            >
              <span className="w-12 shrink-0 text-center">
                <span className="block text-lg font-semibold tabular-nums">
                  {k.currentPosition != null ? Math.round(k.currentPosition) : '–'}
                </span>
                <span className="text-[10px] text-[var(--text-faint)]">poziție</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{k.keyword}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {k.intent ?? 'intenție necunoscută'}
                  {k.searchVolume ? ` · ~${k.searchVolume}/lună` : ''}
                  {k.bucket && k.bucket !== 'none' ? ` · ${BUCKET_LABEL[k.bucket] ?? k.bucket}` : ''}
                </span>
              </span>
              {k.opportunityScore != null && (
                <Badge tone={scoreTone(k.opportunityScore)}>{k.opportunityScore}</Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {detailKw && (
        <KeywordDetail siteId={siteId} kwId={detailKw} onClose={() => setDetailKw(null)} />
      )}
    </div>
  );
}
