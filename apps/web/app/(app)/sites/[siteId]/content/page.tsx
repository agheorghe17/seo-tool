'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  useBuildPrompt,
  useContent,
  useDiscardDraft,
  usePublishArticle,
  useSaveArticle,
  useStartContent,
  useVerifyArticle,
  type ArticleVerdict,
  type ContentDraft,
} from '@/lib/content';
import { useSite } from '@/lib/queries';
import { Badge, Button, Card, EmptyState, ErrorState, SectionTitle, Skeleton } from '@/components/ui';

const PHASE_LABEL: Record<number, string> = { 30: 'Primele 30 de zile', 60: 'Zilele 30–60', 90: 'Zilele 60–90' };
const fmt = (n: number) => Math.round(n).toLocaleString('ro-RO');

export default function ArticlesPage() {
  const siteId = useParams().siteId as string;
  const { data, isLoading, error } = useContent(siteId);
  const { data: site } = useSite(siteId);
  const start = useStartContent(siteId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState error={error} />;

  const articles = data?.articles ?? [];
  const plan = data?.plan;
  const byPhase = [30, 60, 90].map((p) => ({ p, list: articles.filter((a) => (a.phase ?? 30) === p) }));
  const ideas = data?.ideas ?? [];
  const standalone = data?.standalone ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Articole de blog</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Platforma decide câte articole și pe ce cuvinte, cu link intern către paginile-bani. Tu
          rulezi promptul în Claude, lipești textul, iar noi îl verificăm și
          {data?.autoPublishBlog
            ? ' îl publicăm automat live dacă trece tot.'
            : ' îți dăm un clic „Publică pe blog” după verificare.'}
        </p>
      </div>

      {plan && plan.total > 0 && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <div className="text-xs text-[var(--text-muted)]">Recomandăm</div>
              <div className="mt-0.5 text-lg font-semibold">{plan.total} articole</div>
              <div className="text-xs text-[var(--text-faint)]">
                {plan.cadence.d30} în 30z · {plan.cadence.d60} în 60z · {plan.cadence.d90} în 90z
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">Potențial când sunt toate live</div>
              <div className="mt-0.5 text-lg font-semibold text-[var(--good)]">
                +{fmt(plan.estClicksLow)}–{fmt(plan.estClicksHigh)}/lună
              </div>
              <div className="text-xs text-[var(--text-faint)]">interval, nu o promisiune</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">Publicare</div>
              <div className="mt-0.5 text-sm">
                {data?.autoPublishBlog
                  ? 'Automată (trece toate verificările)'
                  : 'Un clic după verificare'}
              </div>
              <div className="text-xs text-[var(--text-faint)]">se schimbă din Setări</div>
            </div>
          </div>
        </Card>
      )}

      {!site?.wpSiteUrl && (
        <Card>
          <p className="text-sm text-[var(--warn)]">
            Conectează WordPress în Setări ca să publicăm articolele. Poți pregăti prompturile și
            acum.
          </p>
        </Card>
      )}

      {plan && plan.total === 0 && (
        <EmptyState
          icon="📰"
          title="Planul de articole nu e gata"
          hint={'Se generează după strategie. Apasă „Reface strategia" din Autopilot.'}
        />
      )}

      {byPhase.map(
        ({ p, list }) =>
          list.length > 0 && (
            <div key={p}>
              <SectionTitle>{PHASE_LABEL[p]}</SectionTitle>
              <div className="space-y-4">
                {list.map((d) => (
                  <ArticleCard key={d.id} siteId={siteId} draft={d} wpConnected={!!site?.wpSiteUrl} />
                ))}
              </div>
            </div>
          ),
      )}

      {standalone.length > 0 && (
        <div>
          <SectionTitle>Articole adăugate manual</SectionTitle>
          <div className="space-y-4">
            {standalone.map((d) => (
              <ArticleCard key={d.id} siteId={siteId} draft={d} wpConnected={!!site?.wpSiteUrl} />
            ))}
          </div>
        </div>
      )}

      {ideas.length > 0 && (
        <div>
          <SectionTitle hint={`${ideas.length} subiecte`}>Alte idei (opțional)</SectionTitle>
          <div className="space-y-2">
            {ideas.map((idea) => (
              <div
                key={idea.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <div>
                  <div className="font-medium">{idea.keyword}</div>
                  <div className="text-xs text-[var(--text-muted)]">{idea.intent ?? 'intenție necunoscută'}</div>
                </div>
                <Button size="sm" variant="ghost" disabled={start.isPending} onClick={() => start.mutate(idea.id)}>
                  Adaugă în plan
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VerdictList({ v }: { v: ArticleVerdict }) {
  const icon = (s: string) => (s === 'pass' ? '✅' : s === 'warn' ? '⚠️' : '❌');
  const tone = (s: string) =>
    s === 'pass' ? 'text-[var(--good)]' : s === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--bad)]';
  return (
    <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-3 text-xs">
      <div className="mb-2 font-medium">
        Verificare: {v.score}/100 · {v.pass ? 'trece' : 'nu trece încă'}
      </div>
      <ul className="space-y-1">
        {v.checks.map((c) => (
          <li key={c.id} className={`flex gap-2 ${tone(c.status)}`}>
            <span aria-hidden>{icon(c.status)}</span>
            <span>
              {c.label}
              {c.detail ? <span className="text-[var(--text-faint)]"> — {c.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArticleCard({
  siteId,
  draft,
  wpConnected,
}: {
  siteId: string;
  draft: ContentDraft;
  wpConnected: boolean;
}) {
  const buildPrompt = useBuildPrompt(siteId);
  const save = useSaveArticle(siteId);
  const verifyM = useVerifyArticle(siteId);
  const publish = usePublishArticle(siteId);
  const discard = useDiscardDraft(siteId);
  const [article, setArticle] = useState(draft.articleMd ?? '');
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const verdict = draft.verify;

  async function copyPrompt() {
    let text = draft.promptText;
    if (!text) {
      const r = await buildPrompt.mutateAsync(draft.id);
      text = r.draft.promptText;
    }
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowPrompt(true);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{draft.title ?? 'Articol'}</div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
            {draft.cluster ? `cluster: ${draft.cluster} · ` : ''}
            {draft.linkTo ? (
              <>
                linkează spre <code>{safePath(draft.linkTo)}</code> cu ancora „{draft.anchor}”
              </>
            ) : (
              'fără link intern definit'
            )}
            {draft.estClicks ? ` · potențial +${fmt(draft.estClicks.low)}–${fmt(draft.estClicks.high)}/lună` : ''}
          </div>
        </div>
        <Badge
          tone={
            draft.status === 'published'
              ? 'good'
              : draft.status === 'review'
                ? 'info'
                : 'neutral'
          }
        >
          {draft.status === 'published'
            ? draft.autoPublished
              ? 'publicat auto'
              : 'publicat live'
            : draft.status === 'review'
              ? 'de verificat'
              : draft.status === 'prompt_ready'
                ? 'prompt gata'
                : 'de scris'}
        </Badge>
      </div>

      {draft.status === 'published' ? (
        <p className="mt-3 text-sm text-[var(--good)]">
          Live pe blog.{' '}
          {draft.wpLink && (
            <a href={draft.wpLink} target="_blank" rel="noreferrer" className="underline">
              vezi articolul →
            </a>
          )}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={copyPrompt} loading={buildPrompt.isPending}>
              {copied ? '✓ Prompt copiat' : 'Copiază promptul'}
            </Button>
            {draft.promptText && (
              <Button size="sm" variant="ghost" onClick={() => setShowPrompt((v) => !v)}>
                {showPrompt ? 'ascunde promptul' : 'vezi promptul'}
              </Button>
            )}
            <a
              href="https://claude.ai/new"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-[var(--accent-text)] hover:underline"
            >
              deschide Claude →
            </a>
          </div>

          {showPrompt && draft.promptText && (
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-3 text-xs">
              {draft.promptText}
            </pre>
          )}

          <div className="mt-4">
            <label className="text-xs text-[var(--text-muted)]">Lipește articolul (Markdown) din Claude:</label>
            <textarea
              rows={8}
              value={article}
              onChange={(e) => setArticle(e.target.value)}
              placeholder="# Titlu&#10;&#10;## Pe scurt&#10;..."
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-transparent px-3 py-2 font-mono text-xs"
            />
          </div>

          {verdict && <VerdictList v={verdict} />}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              loading={save.isPending}
              disabled={!article.trim()}
              onClick={() => save.mutate({ id: draft.id, articleMd: article })}
            >
              Salvează + verifică
            </Button>
            {verdict && (
              <Button
                size="sm"
                variant="ghost"
                loading={verifyM.isPending}
                onClick={() => verifyM.mutate(draft.id)}
              >
                Verifică din nou
              </Button>
            )}
            <Button
              size="sm"
              loading={publish.isPending}
              disabled={!wpConnected || !article.trim() || (verdict ? !verdict.pass : true)}
              onClick={async () => {
                if (article !== draft.articleMd) await save.mutateAsync({ id: draft.id, articleMd: article });
                publish.mutate({ id: draft.id });
              }}
            >
              Publică pe blog
            </Button>
            {verdict && !verdict.pass && (
              <Button
                size="sm"
                variant="ghost"
                loading={publish.isPending}
                onClick={async () => {
                  if (article !== draft.articleMd) await save.mutateAsync({ id: draft.id, articleMd: article });
                  publish.mutate({ id: draft.id, force: true });
                }}
              >
                Publică oricum
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => discard.mutate(draft.id)}>
              Renunță
            </Button>
          </div>

          {publish.isError && (
            <p className="mt-2 text-sm text-[var(--bad)]">{(publish.error as Error).message}</p>
          )}
        </>
      )}
    </Card>
  );
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}
