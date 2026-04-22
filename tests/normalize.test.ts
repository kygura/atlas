import { expect, test } from "bun:test";
import { normalizeAndFilter } from "../src/cli/normalize";
import type { HardFilters } from "../src/ingestion/schemas";

const filters: HardFilters = {
  max_stops: 2,
  max_travel_time_hours: 22,
  budget_economy_eur: { min: 300, max: 1800 },
  fallback_origins: ["AGP", "MAD"],
  lastminute_window_days: 21
};

test("normalizeAndFilter dedupes route windows and keeps cheaper result", () => {
  const raw = [
    {
      source: "kiwi",
      origin: "AGP",
      destination: "LOP",
      destination_name: "Lombok",
      travel_window_start: "2026-05-10",
      travel_window_end: "2026-05-24",
      days_out: 18,
      price_economy_eur: 950,
      stops: 1,
      best_layover: "SIN",
      travel_time_hours: 18,
      booking_url: "https://example.com/kiwi"
    },
    {
      source: "lastminute",
      origin: "AGP",
      destination: "LOP",
      destination_name: "Lombok",
      travel_window_start: "2026-05-10",
      travel_window_end: "2026-05-24",
      days_out: 18,
      price_economy_eur: 850,
      stops: 1,
      best_layover: "SIN",
      travel_time_hours: 18,
      booking_url: "https://example.com/lastminute"
    },
    {
      source: "kiwi",
      origin: "AGP",
      destination: "PPS",
      destination_name: "Palawan",
      travel_window_start: "2026-05-10",
      travel_window_end: "2026-05-24",
      days_out: 18,
      price_economy_eur: 250,
      stops: 1,
      best_layover: "DOH",
      travel_time_hours: 19,
      booking_url: "https://example.com/filtered"
    }
  ];

  const normalized = normalizeAndFilter(raw, filters);
  expect(normalized.results).toHaveLength(1);
  expect(normalized.results[0]?.source).toBe("lastminute");
  expect(normalized.failures).toHaveLength(1);
});
