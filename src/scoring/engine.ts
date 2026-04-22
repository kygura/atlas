import type {
  FlightResult,
  LLMAnnotation,
  ScoredResult,
  ScoringWeights,
  WishlistItem
} from "../ingestion/schemas";
import type { RouteBaseline } from "../context/history";
import { buildRouteKey } from "../context/history";

const DEFAULT_BUDGET_MAX = 1800;
const CROWD_MAP: Record<string, number> = {
  low: 10,
  medium: 6,
  high: 3,
  peak: 1
};

export function computePriceVsBaselinePct(
  price: number | null,
  baseline: RouteBaseline | undefined
): number | null {
  if (!baseline || baseline.count < 3 || price == null || baseline.median <= 0) {
    return null;
  }

  return Number((((baseline.median - price) / baseline.median) * 100).toFixed(2));
}

export function scoreFlight(
  flight: FlightResult,
  annotation: LLMAnnotation,
  baseline: RouteBaseline | undefined,
  weights: ScoringWeights,
  intentTags: string[]
): Omit<ScoredResult, "flight" | "annotation"> {
  const baselineMedian = baseline?.median;
  const hasBaseline = baseline != null && baseline.count >= 3 && baselineMedian != null;
  const economyPrice = flight.price_economy_eur;

  const priceScore = hasBaseline && economyPrice != null
    ? Math.max(0, Math.min(10, 10 - ((economyPrice / baselineMedian) - 0.7) * 15))
    : Math.max(0, 10 - (((economyPrice ?? DEFAULT_BUDGET_MAX) / DEFAULT_BUDGET_MAX) * 10));

  const weather = (annotation.weather_score - 1) * 2.5;
  const crowd = CROWD_MAP[annotation.crowd_level] ?? 5;
  const surf = intentTags.includes("surf")
    ? ((annotation.surf_quality ?? 3) - 1) * 2.5
    : 5;
  const isolation = (annotation.isolation_score - 1) * 2.5;

  const compositeScore = Number(Math.max(0, Math.min(10, (
    priceScore * weights.price_vs_baseline +
    weather * weights.weather_score +
    crowd * weights.crowd_level +
    surf * weights.surf_quality +
    isolation * weights.isolation_score
  ))).toFixed(2));

  const opportunityFlag = Boolean(
    hasBaseline &&
    economyPrice != null &&
    compositeScore >= weights.opportunity_threshold &&
    economyPrice < baselineMedian * 0.85
  );

  const opportunityReason = opportunityFlag && economyPrice != null && baselineMedian != null
    ? `€${economyPrice.toFixed(0)} vs €${baselineMedian.toFixed(0)} median (${(((baselineMedian - economyPrice) / baselineMedian) * 100).toFixed(0)}% below)`
    : null;

  return {
    price_vs_baseline_pct: computePriceVsBaselinePct(economyPrice, baseline),
    composite_score: compositeScore,
    opportunity_flag: opportunityFlag,
    opportunity_reason: opportunityReason
  };
}

export function scoreAll(
  flights: FlightResult[],
  annotations: LLMAnnotation[],
  baselines: Record<string, RouteBaseline>,
  weights: ScoringWeights,
  wishlist: WishlistItem[]
): ScoredResult[] {
  const annotationsById = new Map(annotations.map((annotation) => [annotation.flight_id, annotation]));
  const wishlistByIata = new Map(wishlist.map((item) => [item.iata, item]));

  return flights.map((flight) => {
    const annotation = annotationsById.get(flight.flight_id);
    if (!annotation) {
      throw new Error(`Missing annotation for flight_id ${flight.flight_id}`);
    }

    const baseline = baselines[buildRouteKey(flight.origin, flight.destination)];
    const intentTags = wishlistByIata.get(flight.destination)?.intent_tags ?? [];
    return {
      flight,
      annotation,
      ...scoreFlight(flight, annotation, baseline, weights, intentTags)
    };
  });
}
