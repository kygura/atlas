import type {
  DestinationCandidate,
  DiscoveryWeights,
  ScoredDestinationCandidate
} from "../ingestion/schemas";

// Same order of magnitude as DEFAULT_BUDGET_MAX in src/scoring/engine.ts —
// discovery candidates rarely have a real baseline yet, so this anchors the
// price signal score without one.
const PRICE_REFERENCE_EUR = 900;

function scaleToTen(oneToFive: number): number {
  return (oneToFive - 1) * 2.5;
}

export function scoreDestinationCandidate(
  candidate: DestinationCandidate,
  weights: DiscoveryWeights,
  isRepeat: boolean
): ScoredDestinationCandidate {
  const weather = scaleToTen(candidate.weather_score);
  const tourismSeason = scaleToTen(candidate.tourism_season_score);
  const conditions = scaleToTen(candidate.conditions_score);
  const priceSignalEur = candidate.price_signal_eur;
  const thinPriceSignal = priceSignalEur == null;
  const priceScore = thinPriceSignal
    ? 5
    : Math.max(0, Math.min(10, 10 - (priceSignalEur / PRICE_REFERENCE_EUR) * 10));

  const rawScore =
    weather * weights.weather_score +
    tourismSeason * weights.tourism_season_score +
    conditions * weights.conditions_score +
    priceScore * weights.price_signal;

  const penalized = isRepeat ? rawScore - weights.repeat_penalty : rawScore;
  const compositeScore = Number(Math.max(0, Math.min(10, penalized)).toFixed(2));

  return {
    ...candidate,
    composite_score: compositeScore,
    repeat_penalty_applied: isRepeat,
    thin_price_signal: thinPriceSignal
  };
}

export function scoreAllCandidates(
  candidates: DestinationCandidate[],
  weights: DiscoveryWeights,
  recentIatas: Set<string>
): ScoredDestinationCandidate[] {
  return candidates
    .map((candidate) => scoreDestinationCandidate(candidate, weights, recentIatas.has(candidate.iata)))
    .sort((left, right) => right.composite_score - left.composite_score);
}
