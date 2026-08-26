import { expect, test } from "bun:test";
import { findWatchHits } from "../src/scoring/watch";
import type { ScoredResult, WishlistItem } from "../src/ingestion/schemas";

function scoredResult(overrides: Partial<ScoredResult> = {}): ScoredResult {
  return {
    flight: {
      flight_id: "MAD-BKK-2026-06-01",
      source: "kiwi",
      origin: "MAD",
      destination: "BKK",
      destination_name: "Bangkok",
      travel_window_start: "2026-06-01",
      travel_window_end: "2026-06-15",
      days_out: 40,
      price_economy_eur: 700,
      price_business_eur: null,
      stops: 1,
      best_layover: "IST",
      travel_time_hours: 16,
      booking_url: "https://example.com/book",
      snapshot_date: "2026-04-22",
      search_error: null
    },
    annotation: {
      flight_id: "MAD-BKK-2026-06-01",
      weather_score: 4,
      crowd_level: "medium",
      notable_events: [],
      distortion_flag: false,
      distortion_reason: null,
      surf_quality: null,
      isolation_score: 3,
      personal_flag: "Good shoulder-season pick.",
      raw_reasoning: "reasoning"
    },
    price_vs_baseline_pct: -20,
    composite_score: 7,
    opportunity_flag: true,
    opportunity_reason: "€700 vs €1000 median (30% below)",
    ...overrides
  };
}

function watchedItem(overrides: Partial<WishlistItem> = {}): WishlistItem {
  return {
    destination: "Thailand",
    iata: "BKK",
    status: "watching",
    intent_tags: ["cultural-travel"],
    source: "user_requested",
    requested_by: "555",
    watch_active: true,
    target_budget_eur: null,
    ...overrides
  };
}

test("findWatchHits returns a hit for an opportunity_flag result on a watched destination", () => {
  const hits = findWatchHits([scoredResult()], [watchedItem()]);
  expect(hits).toHaveLength(1);
  expect(hits[0].requested_by).toBe("555");
  expect(hits[0].iata).toBe("BKK");
});

test("findWatchHits ignores destinations that are not on the watchlist", () => {
  const hits = findWatchHits([scoredResult({ flight: { ...scoredResult().flight, destination: "LIS" } })], [watchedItem()]);
  expect(hits).toHaveLength(0);
});

test("findWatchHits ignores watch entries with watch_active: false", () => {
  const hits = findWatchHits([scoredResult()], [watchedItem({ watch_active: false })]);
  expect(hits).toHaveLength(0);
});

test("findWatchHits ignores distorted results", () => {
  const result = scoredResult({ annotation: { ...scoredResult().annotation, distortion_flag: true, distortion_reason: "conference spike" } });
  const hits = findWatchHits([result], [watchedItem()]);
  expect(hits).toHaveLength(0);
});

test("findWatchHits filters out results above the requester's target budget", () => {
  const hits = findWatchHits(
    [scoredResult({ flight: { ...scoredResult().flight, price_economy_eur: 1600 } })],
    [watchedItem({ target_budget_eur: { min: null, max: 1500 } })]
  );
  expect(hits).toHaveLength(0);
});

test("findWatchHits surfaces a non-deal result when it clears the requester's target budget", () => {
  const flatResult = scoredResult({ opportunity_flag: false, opportunity_reason: null, price_vs_baseline_pct: null });
  const hits = findWatchHits([flatResult], [watchedItem({ target_budget_eur: { min: null, max: 1500 } })]);
  expect(hits).toHaveLength(1);
  expect(hits[0].reason).toContain("target budget");
});

test("findWatchHits requires either a deal signal or a target budget when no budget is set", () => {
  const flatResult = scoredResult({ opportunity_flag: false, opportunity_reason: null, price_vs_baseline_pct: null });
  const hits = findWatchHits([flatResult], [watchedItem()]);
  expect(hits).toHaveLength(0);
});
