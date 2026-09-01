/**
 * Epic 23 — content-decay radar. PURE. Given monthly GSC history per page, find pages
 * that used to perform and are sliding — the highest-ROI SEO work (refresh over rewrite).
 */

export interface TrafficMonth {
  url: string;
  month: string; // 'YYYY-MM'
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface DecayFinding {
  url: string;
  monthsDeclining: number;
  clicksDropPct: number; // vs peak, 0..1
  peakMonth: string;
  peakClicks: number;
  currentClicks: number;
  positionDrift: number | null; // current - best (positive = worse)
  reason: 'traffic_decline' | 'ranking_loss';
}

export function detectDecay(history: TrafficMonth[], opts: { minMonths?: number } = {}): DecayFinding[] {
  const minMonths = opts.minMonths ?? 3;
  const byUrl = new Map<string, TrafficMonth[]>();
  for (const h of history) {
    const arr = byUrl.get(h.url) ?? [];
    arr.push(h);
    byUrl.set(h.url, arr);
  }

  const out: DecayFinding[] = [];
  for (const [url, rowsRaw] of byUrl) {
    const rows = [...rowsRaw].sort((a, b) => a.month.localeCompare(b.month));
    if (rows.length < minMonths + 1) continue;

    const peak = rows.reduce((best, r) => (r.clicks > best.clicks ? r : best), rows[0]!);
    const current = rows[rows.length - 1]!;

    // Trailing run of months where clicks did not increase.
    let monthsDeclining = 0;
    for (let i = rows.length - 1; i > 0; i--) {
      if (rows[i]!.clicks <= rows[i - 1]!.clicks) monthsDeclining++;
      else break;
    }

    const clicksDropPct = peak.clicks > 0 ? 1 - current.clicks / peak.clicks : 0;

    const positions = rows.map((r) => r.position).filter((p): p is number => p != null);
    const bestPos = positions.length ? Math.min(...positions) : null;
    const positionDrift = bestPos != null && current.position != null ? current.position - bestPos : null;

    const trafficDecline =
      monthsDeclining >= minMonths && clicksDropPct >= 0.35 && peak.clicks >= 3;
    const impressionsHeld =
      current.impressions >= peak.impressions * 0.6 || current.impressions >= 50;
    const rankingLoss = positionDrift != null && positionDrift >= 5 && impressionsHeld;

    if (!trafficDecline && !rankingLoss) continue;

    out.push({
      url,
      monthsDeclining,
      clicksDropPct: Math.round(clicksDropPct * 100) / 100,
      peakMonth: peak.month,
      peakClicks: peak.clicks,
      currentClicks: current.clicks,
      positionDrift: positionDrift != null ? Math.round(positionDrift * 10) / 10 : null,
      reason: rankingLoss && !trafficDecline ? 'ranking_loss' : 'traffic_decline',
    });
  }

  return out.sort((a, b) => b.peakClicks - a.peakClicks);
}
