import { expect, test } from "bun:test";
import { scoreAllCandidates, scoreDestinationCandidate } from "../src/scoring/discovery";
import type { DestinationCandidate, DiscoveryWeights } from "../src/ingestion/schemas";

const weights: DiscoveryWeights = {
  weather_score: 0.3,
  tourism_season_score: 0.3,
  conditions_score: 0.25,
  price_signal: 0.15,
  min_composite_score: 3.0,
  repeat_penalty: 1.5,
  repeat_window_days: 45,
  max_candidates_per_run: 5
};

function candidate(overrides: Partial<DestinationCandidate> = {}): DestinationCandidate {
  return {
    destination: "Fogo Island, Cape Verde",
    iata: "SFL",
    profile_id: "surf",
    reason: "Consistent swell, shoulder season, low crowds.",
    intent_tags: ["surf", "remote"],
    avoid_periods: [],
    weather_score: 5,
    conditions_score: 5,
    tourism_season_score: 5,
    price_signal_eur: 300,
    price_signal_note: "Indicative fare from AGP via web search",
    ...overrides
  };
}

test("scoreDestinationCandidate rewards strong signals with a high composite score", () => {
  const scored = scoreDestinationCandidate(candidate(), weights, false);
  expect(scored.composite_score).toBeGreaterThan(8);
  expect(scored.repeat_penalty_applied).toBe(false);
  expect(scored.thin_price_signal).toBe(false);
});

test("scoreDestinationCandidate treats a missing price signal as neutral, not penalized", () => {
  const scored = scoreDestinationCandidate(candidate({ price_signal_eur: null, price_signal_note: null }), weights, false);
  expect(scored.thin_price_signal).toBe(true);
  expect(scored.composite_score).toBeGreaterThan(0);
});

test("scoreDestinationCandidate applies the repeat penalty for destinations scouted recently", () => {
  const fresh = scoreDestinationCandidate(candidate(), weights, false);
  const repeat = scoreDestinationCandidate(candidate(), weights, true);
  expect(repeat.repeat_penalty_applied).toBe(true);
  expect(repeat.composite_score).toBeLessThan(fresh.composite_score);
  expect(fresh.composite_score - repeat.composite_score).toBeCloseTo(weights.repeat_penalty, 1);
});

test("scoreDestinationCandidate clamps composite score to [0, 10]", () => {
  const weak = candidate({ weather_score: 1, conditions_score: 1, tourism_season_score: 1, price_signal_eur: 5000 });
  const scored = scoreDestinationCandidate(weak, weights, true);
  expect(scored.composite_score).toBeGreaterThanOrEqual(0);
});

test("scoreAllCandidates ranks by composite score descending", () => {
  const strong = candidate({ iata: "SFL" });
  const weak = candidate({ iata: "WEK", weather_score: 2, conditions_score: 2, tourism_season_score: 2, price_signal_eur: 1200 });
  const scored = scoreAllCandidates([weak, strong], weights, new Set());
  expect(scored[0].iata).toBe("SFL");
  expect(scored[1].iata).toBe("WEK");
});

test("scoreAllCandidates penalizes destinations present in recentIatas", () => {
  const repeat = candidate({ iata: "SFL" });
  const scored = scoreAllCandidates([repeat], weights, new Set(["SFL"]));
  expect(scored[0].repeat_penalty_applied).toBe(true);
});
