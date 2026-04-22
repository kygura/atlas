import { expect, test } from "bun:test";
import { normalizeAndFilter } from "../src/cli/normalize";
import type { HardFilters } from "../src/ingestion/schemas";

const filters: HardFilters = {
  max_stops: 2,
  max_travel_time_hours: 22,
  max_layover_wait_hours: 6,
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

test("normalizeAndFilter filters flights with transfer waits above the hardcoded limit", () => {
  const raw = [
    {
      source: "kiwi",
      origin: "AGP",
      destination: "DPS",
      destination_name: "Bali",
      travel_window_start: "2026-05-10",
      travel_window_end: "2026-05-24",
      days_out: 18,
      price_economy_eur: 900,
      stops: 1,
      best_layover: "DOH",
      travel_time_hours: 20,
      layovers: [{ airport: "DOH", wait_hours: 7 }],
      booking_url: "https://example.com/too-long"
    },
    {
      source: "kiwi",
      origin: "AGP",
      destination: "CMB",
      destination_name: "Colombo",
      travel_window_start: "2026-05-10",
      travel_window_end: "2026-05-24",
      days_out: 18,
      price_economy_eur: 800,
      stops: 1,
      best_layover: "IST",
      travel_time_hours: 17,
      layovers: [{ airport: "IST", wait_hours: 3 }],
      booking_url: "https://example.com/ok"
    }
  ];

  const normalized = normalizeAndFilter(raw, filters);
  expect(normalized.results).toHaveLength(1);
  expect(normalized.results[0]?.destination).toBe("CMB");
  expect(normalized.failures[0]?.reason).toContain("max_layover_wait_hours");
});

test("normalizeAndFilter derives transfer waits from segment timestamps when needed", () => {
  const raw = [
    {
      source: "kiwi",
      origin: "AGP",
      destination: "HKT",
      destination_name: "Phuket",
      travel_window_start: "2026-05-10",
      travel_window_end: "2026-05-24",
      days_out: 18,
      price_economy_eur: 1100,
      stops: 1,
      best_layover: "AUH",
      travel_time_hours: 21,
      segments: [
        { departure_at: "2026-05-10T08:00:00Z", arrival_at: "2026-05-10T12:00:00Z" },
        { departure_at: "2026-05-10T19:30:00Z", arrival_at: "2026-05-11T05:00:00Z" }
      ],
      booking_url: "https://example.com/segment-derived"
    }
  ];

  const normalized = normalizeAndFilter(raw, filters);
  expect(normalized.results).toHaveLength(0);
  expect(normalized.failures[0]?.reason).toContain("7.5h > 6h");
});
