import type { ScoredResult, WishlistItem } from "../ingestion/schemas";

export type WatchHit = {
  iata: string;
  destination: string;
  requested_by: string;
  result: ScoredResult;
  reason: string;
};

const BASELINE_DEAL_THRESHOLD_PCT = -15;

function isWatchedAndActive(item: WishlistItem): item is WishlistItem & { requested_by: string } {
  return item.source === "user_requested" && item.watch_active !== false && !!item.requested_by;
}

function withinTargetBudget(item: WishlistItem, priceEconomyEur: number | null): boolean {
  const max = item.target_budget_eur?.max;
  if (max == null) {
    return true;
  }
  return priceEconomyEur != null && priceEconomyEur <= max;
}

/**
 * Finds scored flight results that clear the deal bar for a destination the
 * traveller explicitly asked Atlas to watch (via /watch), so a dedicated
 * notification can be routed to the requester's chat_id independent of the
 * main scan digest.
 */
export function findWatchHits(scored: ScoredResult[], wishlist: WishlistItem[]): WatchHit[] {
  const watched = wishlist.filter(isWatchedAndActive);
  if (!watched.length) {
    return [];
  }

  const hits: WatchHit[] = [];
  for (const item of watched) {
    const candidates = scored.filter(
      (result) => result.flight.destination === item.iata && !result.annotation.distortion_flag
    );

    for (const result of candidates) {
      const price = result.flight.price_economy_eur;
      if (!withinTargetBudget(item, price)) {
        continue;
      }

      const isBaselineDeal =
        result.price_vs_baseline_pct != null && result.price_vs_baseline_pct <= BASELINE_DEAL_THRESHOLD_PCT;
      const hasTargetBudget = item.target_budget_eur?.max != null;

      if (!result.opportunity_flag && !isBaselineDeal && !hasTargetBudget) {
        continue;
      }

      const reason = result.opportunity_flag && result.opportunity_reason
        ? result.opportunity_reason
        : isBaselineDeal && result.price_vs_baseline_pct != null
          ? `${Math.abs(result.price_vs_baseline_pct).toFixed(0)}% below baseline median`
          : `Within target budget €${item.target_budget_eur?.max}`;

      hits.push({
        iata: item.iata,
        destination: item.destination,
        requested_by: item.requested_by,
        result,
        reason
      });
    }
  }

  return hits;
}
