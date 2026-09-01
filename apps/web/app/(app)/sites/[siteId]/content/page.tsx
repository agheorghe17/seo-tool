'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  useContent,
  useDiscardDraft,
  usePublishDraft,
  useSaveArticle,
  useStartContent,
  type ContentDraft,
  type ContentIdea,
} from '@/lib/content';
import { useSite } from '@/lib/queries';
import { Badge, Button, Card, EmptyState, ErrorState, SectionTitle, Skeleton } from '@/components/ui';

const STATUS_LABEL: Record<ContentDraft['status'], string> = {
  idea: 'idee',
  prompt_ready: 'prompt gata',
  review: 'articol lipit',
  published: 'draft în WordPress',
  discarded: 'renunțat',
};

export default function ContentPage() {
  const siteId = useParams().siteId as string;
  const { data, isLoading, error } = useContent(siteId);
  const { data: site } = useSite(siteId);
  const start = useStartContent(siteId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState error={error} />;

  const drafts = (data?.drafts ?? []).filter((d) => d.status !== 'discarded');
  const active = drafts.filter((d) => d.status === 'prompt_ready' || d.status === 'review');
  const published = drafts.filter((d) => d.status === 'published');
  const ideas = data?.ideas ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conținut</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Aplicația scrie <strong>promptul</strong> din analiză. Tu îl rulezi în Claude-ul tău,
          lipești articolul înapoi, iar noi îl punem în WordPress <strong>ca draft</strong> — tu îl
          publici după ce-l verifici.
        </p>
      </div>

      {!site?.wpSiteUrl && (
        <Card>
          <p className="text-sm text-[var(--warn)]">
            Conectează WordPress în Setări ca să poți publica drafturile direct. Poți pregăti
            prompturile și acum.
          </p>
        </Card>
      )}

      {active.length > 0 && (
        <div>
          <SectionTitle>În lucru</SectionTitle>
          <div className="space-y-4">
            {active.map((d) => (
              <DraftCard key={d.id} siteId={siteId} draft={d} wpConnected={!!site?.wpSiteUrl} />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle hint={ideas.length ? `${ideas.length} subiecte` : undefined}>De scris</SectionTitle>
        {ideas.length === 0 ? (
          <EmptyState
            icon="📝"
            title="Nicio idee de articol încă"
            hint="Ideile apar din oportunitățile de cuvinte cheie fără pagină. Reface strategia din Autopilot dacă lista e goală."
          />
        ) : (
          <div className="space-y-2">
            {ideas.map((idea: ContentIdea) => (
              <div
                key={idea.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <div>
                  <div className="font-medium">{idea.keyword}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {idea.intent ?? 'intenție necunoscută'}
                    {idea.hasTargetPage ? ' · ai deja o pagină — o îmbunătățim' : ' · pagină nouă'}
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={start.isPending}
                  onClick={() => start.mutate(idea.id)}
                >
                  Pregătește promptul
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {published.length > 0 && (
        <div>
          <SectionTitle>Publicate ca draft</SectionTitle>
          <div className="space-y-2">
            {published.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
              >
                <span className="font-medium">{d.title}</span>
                <div className="flex items-center gap-2">
                  <Badge tone="good">draft în WordPress</Badge>
                  {d.wpEditLink && (
                    <a
                      href={d.wpEditLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent-text)] hover:underline"
                    >
                      deschide în WordPress →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DraftCard({
  siteId,
  draft,
  wpConnected,
}: {
  siteId: string;
  draft: ContentDraft;
  wpConnected: boolean;
}) {
  const save = useSaveArticle(siteId);
  const publish = usePublishDraft(siteId);
  const discard = useDiscardDraft(siteId);
  const [article, setArticle] = useState(draft.articleMd ?? '');
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(draft.status === 'prompt_ready');

  async function copyPrompt() {
    if (!draft.promptText) return;
    try {
      await navigator.clipboard.writeText(draft.promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowPrompt(true);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{draft.title ?? 'Articol'}</div>
        <Badge tone={draft.status === 'review' ? 'info' : 'neutral'}>
          {STATUS_LABEL[draft.status]}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={copyPrompt}>
          {copied ? '✓ Copiat' : 'Copiază promptul'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowPrompt((v) => !v)}>
          {showPrompt ? 'ascunde promptul' : 'vezi promptul'}
        </Button>
        <a
          href="https://claude.ai/new"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--accent-text)] hover:underline"
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
        <label className="text-xs text-[var(--text-muted)]">
          Lipește articolul (Markdown) primit de la Claude:
        </label>
        <textarea
          rows={8}
          value={article}
          onChange={(e) => setArticle(e.target.value)}
          placeholder="# Titlu&#10;&#10;## Pe scurt&#10;..."
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-transparent px-3 py-2 font-mono text-xs"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={save.isPending || !article.trim()}
          onClick={() => save.mutate({ id: draft.id, articleMd: article })}
        >
          {save.isPending ? 'Se salvează…' : 'Salvează articolul'}
        </Button>
        <Button
          size="sm"
          disabled={publish.isPending || !article.trim() || !wpConnected}
          onClick={async () => {
            if (article.trim() && article !== draft.articleMd) {
              await save.mutateAsync({ id: draft.id, articleMd: article });
            }
            publish.mutate(draft.id);
          }}
        >
          {publish.isPending
            ? 'Se publică…'
            : draft.wpPostId
              ? 'Actualizează draftul în WordPress'
              : 'Publică draft în WordPress'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => discard.mutate(draft.id)}>
          Renunță
        </Button>
      </div>

      {publish.isError && (
        <p className="mt-2 text-sm text-[var(--bad)]">{(publish.error as Error).message}</p>
      )}
      {publish.data?.editLink && (
        <p className="mt-2 text-sm text-[var(--good)]">
          Publicat ca draft.{' '}
          <a href={publish.data.editLink} target="_blank" rel="noreferrer" className="underline">
            Deschide în WordPress
          </a>{' '}
          ca să-l verifici și să-l publici.
        </p>
      )}
    </Card>
  );
}
