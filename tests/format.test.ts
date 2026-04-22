import { expect, test } from "bun:test";
import { renderItinerary } from "../src/cli/format";
import type { ScoredResult } from "../src/ingestion/schemas";

const scored: ScoredResult[] = [
  {
    flight: {
      flight_id: "AGP-LOP-2026-05-10",
      source: "kiwi",
      origin: "AGP",
      destination: "LOP",
      destination_name: "Lombok",
      travel_window_start: "2026-05-10",
      travel_window_end: "2026-05-24",
      days_out: 18,
      price_economy_eur: 700,
      price_business_eur: null,
      stops: 1,
      best_layover: "SIN",
      travel_time_hours: 18,
      booking_url: null,
      snapshot_date: "2026-04-22",
      search_error: null
    },
    annotation: {
      flight_id: "AGP-LOP-2026-05-10",
      weather_score: 4,
      crowd_level: "medium",
      notable_events: [],
      distortion_flag: false,
      distortion_reason: null,
      surf_quality: 4,
      isolation_score: 4,
      personal_flag: "Promising shoulder season surf.",
      raw_reasoning: "reasoning"
    },
    price_vs_baseline_pct: 22,
    composite_score: 8.3,
    opportunity_flag: true,
    opportunity_reason: "€700 vs €900 median (22% below)"
  }
];

test("renderItinerary prints ranked results, fallback booking links, and first-scan footer", () => {
  const itinerary = renderItinerary(scored, {
    generatedDate: "2026-04-22",
    firstScan: true,
    queryText: "surf and isolation",
    defaultedParams: ["origin", "budget"]
  });
  expect(itinerary).toContain("ATLAS — 2026-04-22 · from AGP");
  expect(itinerary).toContain("Query intent: surf and isolation");
  expect(itinerary).toContain("Defaults applied: origin, budget");
  expect(itinerary).toContain("⚡ #1 Lombok via SIN");
  expect(itinerary).toContain("[search results](https://www.google.com/travel/flights?");
  expect(itinerary).toContain("Promising shoulder season surf.");
  expect(itinerary).toContain("First scan.");
});
