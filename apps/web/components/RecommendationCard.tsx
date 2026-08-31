'use client';

import { useState } from 'react';
import type { RecommendationDto } from '@/lib/queries';
import { useApplyRecommendation, useRollbackRecommendation } from '@/lib/queries';
import { Badge, Button } from './ui';

const META_RULES = new Set(['onpage.title-length', 'onpage.meta-description']);

export function RecommendationCard({
  reco,
  ruleId,
  pageId,
  wpConnected,
}: RecommendationDto & { pageId: string; wpConnected: boolean }) {
  const apply = useApplyRecommendation(pageId);
  const rollback = useRollbackRecommendation(pageId);
  const [open, setOpen] = useState(false);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [mediaId, setMediaId] = useState('');
  const [altText, setAltText] = useState('');

  const canAuto = reco.autoFixable && wpConnected;
  const isMeta = META_RULES.has(ruleId);
  const isAlt = ruleId === 'onpage.image-alt';

  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">#{reco.priorityRank}</Badge>
            <h3 className="font-medium">{reco.fixTitle}</h3>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            impact {reco.impactScore}/5 · efort {reco.effortScore}/5 · {ruleId}
            {reco.llmProvider && reco.llmProvider !== 'none' ? ` · ${reco.llmProvider}` : ''}
          </p>
        </div>
        {reco.applied ? (
          <Button variant="ghost" onClick={() => rollback.mutate(reco.id)}>
            Anulează fix-ul
          </Button>
        ) : canAuto ? (
          <Button onClick={() => setOpen(!open)}>Aplică automat</Button>
        ) : (
          <Badge tone="neutral">manual</Badge>
        )}
      </div>

      {reco.fixDescriptionAiGenerated && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-300">
          {reco.fixDescriptionAiGenerated}
        </p>
      )}

      {open && !reco.applied && (
        <div className="mt-4 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          {isMeta && (
            <>
              <input
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="Meta title nou (opțional)"
                className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
              />
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Meta description nouă (120-160 caractere)"
                rows={2}
                className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
              />
            </>
          )}
          {isAlt && (
            <>
              <input
                value={mediaId}
                onChange={(e) => setMediaId(e.target.value)}
                placeholder="ID media WordPress"
                className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
              />
              <input
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Text alternativ"
                className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
              />
            </>
          )}
          <div className="flex items-center gap-2">
            <Button
              disabled={apply.isPending}
              onClick={() =>
                apply.mutate({
                  id: reco.id,
                  body: isAlt
                    ? { mediaId: Number(mediaId), altText }
                    : { metaTitle: metaTitle || undefined, metaDescription: metaDescription || undefined },
                })
              }
            >
              {apply.isPending ? 'Se aplică…' : 'Confirmă și scrie pe site'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Renunță
            </Button>
          </div>
          {apply.isError && <p className="text-xs text-red-600">{(apply.error as Error).message}</p>}
        </div>
      )}
    </div>
  );
}
