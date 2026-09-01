'use client';

import { useKeywordDetail } from '@/lib/strategy';
import { Badge, Skeleton, scoreTone } from '@/components/ui';
import { RankHistoryChart } from './RankHistoryChart';
import { SeoTermTooltip } from './SeoTermTooltip';

export function KeywordDetail({ siteId, kwId, onClose }: { siteId: string; kwId: string; onClose: () => void }) {
  const { data, isLoading } = useKeywordDetail(siteId, kwId);

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="mb-4 text-sm text-[var(--text-muted)] hover:underline">
          ✕ închide
        </button>

        {isLoading || !data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <h2 className="text-xl font-semibold">{data.keyword.keyword}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {data.keyword.currentPosition != null && (
                <Badge tone={data.keyword.currentPosition <= 10 ? 'good' : 'warning'}>
                  poziția {Math.round(data.keyword.currentPosition)}
                </Badge>
              )}
              <Badge tone="neutral">{data.keyword.intent ?? 'intenție necunoscută'}</Badge>
              {data.keyword.searchVolume > 0 && (
                <Badge tone="neutral">
                  <SeoTermTooltip term="volum">~{data.keyword.searchVolume}/lună</SeoTermTooltip>
                </Badge>
              )}
              {data.keyword.opportunityScore != null && (
                <Badge tone={scoreTone(data.keyword.opportunityScore)}>
                  oportunitate {data.keyword.opportunityScore}
                </Badge>
              )}
              {data.cluster && <Badge tone="neutral">grup: {data.cluster.name}</Badge>}
            </div>

            <section className="mt-6">
              <h3 className="mb-2 font-medium">
                <SeoTermTooltip term="poziție">Evoluția poziției</SeoTermTooltip>
              </h3>
              <RankHistoryChart points={data.rankHistory} />
            </section>

            <section className="mt-6">
              <h3 className="mb-2 font-medium">Cine e în top pentru acest cuvânt</h3>
              {data.serp.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Fără date SERP. Adaugă un provider SERP în <code>.env</code> sau verifică manual pe Google.
                </p>
              ) : (
                <ol className="space-y-1 text-sm">
                  {data.serp.map((s, i) => (
                    <li key={i} className={s.isOwn ? 'font-semibold text-emerald-600' : ''}>
                      {s.position}. {s.domain} {s.isOwn && '(tu)'}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="mt-6">
              <h3 className="mb-2 font-medium">Ce ai de făcut (checklist)</h3>
              {!data.playbook ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Playbook-ul se generează la „Reconstruiește strategia”.
                </p>
              ) : (
                <>
                  {data.playbook.brief?.title && (
                    <p className="mb-2 text-sm text-[var(--text-muted)]">
                      Titlu sugerat: <strong>{data.playbook.brief.title}</strong>
                    </p>
                  )}
                  <ul className="space-y-1.5 text-sm">
                    {data.playbook.checklist.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <span>{c.done ? '✅' : '⬜'}</span>
                        <span>{c.item}</span>
                      </li>
                    ))}
                  </ul>
                  {(data.playbook.brief?.h2s?.length ?? 0) > 0 && (
                    <div className="mt-3 rounded-lg border border-[var(--border)] p-3 text-sm">
                      <p className="mb-1 font-medium">Secțiuni recomandate (H2):</p>
                      <ul className="list-disc pl-5 text-[var(--text-muted)]">
                        {data.playbook.brief!.h2s!.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
