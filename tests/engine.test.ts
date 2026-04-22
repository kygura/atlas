import { describe, expect, test } from "bun:test";
import { scoreFlight } from "../src/scoring/engine";
import type { FlightResult, LLMAnnotation, ScoringWeights } from "../src/ingestion/schemas";

test("scoreFlight computes opportunity with baseline", () => {
  const flight: FlightResult = {
    flight_id: "AGP-LOP-2026-05-10",
    source: "kiwi",
    origin: "AGP",
    destination: "LOP",
    destination_name: "Lombok",
    travel_window_start: "2026-05-10",
    travel_window_end: "2026-05-24",
    days_out: 18,
    price_economy_eur: 600,
    price_business_eur: null,
    stops: 1,
    best_layover: "SIN",
    travel_time_hours: 17,
    booking_url: "https://example.com/book",
    snapshot_date: "2026-04-22",
    search_error: null
  };

  const annotation: LLMAnnotation = {
    flight_id: flight.flight_id,
    weather_score: 5,
    crowd_level: "low",
    notable_events: [],
    distortion_flag: false,
    distortion_reason: null,
    surf_quality: 4,
    isolation_score: 5,
    personal_flag: "Strong surf and isolation window.",
    raw_reasoning: "reasoning"
  };

  const weights: ScoringWeights = {
    price_vs_baseline: 0.3,
    weather_score: 0.25,
    crowd_level: 0.25,
    surf_quality: 0.15,
    isolation_score: 0.05,
    opportunity_threshold: 7.5
  };

  const scored = scoreFlight(flight, annotation, { median: 900, count: 4 }, weights, ["surf"]);
  expect(scored.opportunity_flag).toBe(true);
  expect(scored.price_vs_baseline_pct).toBeGreaterThan(30);
  expect(scored.composite_score).toBeGreaterThan(8);
});

test("scoreFlight falls back when no baseline exists", () => {
  const flight: FlightResult = {
    flight_id: "MAD-PPS-2026-06-01",
    source: "kiwi",
    origin: "MAD",
    destination: "PPS",
    destination_name: "Palawan",
    travel_window_start: "2026-06-01",
    travel_window_end: "2026-06-20",
    days_out: 40,
    price_economy_eur: 1200,
    price_business_eur: null,
    stops: 2,
    best_layover: null,
    travel_time_hours: 20,
    booking_url: "https://example.com/book2",
    snapshot_date: "2026-04-22",
    search_error: null
  };

  const annotation: LLMAnnotation = {
    flight_id: flight.flight_id,
    weather_score: 3,
    crowd_level: "medium",
    notable_events: [],
    distortion_flag: false,
    distortion_reason: null,
    surf_quality: null,
    isolation_score: 3,
    personal_flag: "No signal.",
    raw_reasoning: "reasoning"
  };

  const weights: ScoringWeights = {
    price_vs_baseline: 0.3,
    weather_score: 0.25,
    crowd_level: 0.25,
    surf_quality: 0.15,
    isolation_score: 0.05,
    opportunity_threshold: 7.5
  };

  const scored = scoreFlight(flight, annotation, undefined, weights, []);
  expect(scored.opportunity_flag).toBe(false);
  expect(scored.price_vs_baseline_pct).toBeNull();
  expect(scored.composite_score).toBeGreaterThan(0);
});
