'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** The strategy workspace was merged into the main flow (Cuvinte cheie / Sarcini / Competitori). */
export default function StrategyRedirect() {
  const siteId = useParams().siteId as string;
  const router = useRouter();
  useEffect(() => {
    router.replace(`/sites/${siteId}/keywords`);
  }, [router, siteId]);
  return null;
}
