import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBaselines } from "../src/context/history";

function makeRecord(price: number, date: string) {
  return {
    scan_date: date,
    run_mode: "scheduled",
    origin_resolved: "AGP",
    query: null,
    itinerary_delivered: false,
    itinerary_text: "",
    results: [
      {
        flight: {
          flight_id: `AGP-LOP-${date}`,
          source: "kiwi",
          origin: "AGP",
          destination: "LOP",
          destination_name: "Lombok",
          travel_window_start: date,
          travel_window_end: date,
          days_out: 10,
          price_economy_eur: price,
          price_business_eur: null,
          stops: 1,
          best_layover: "SIN",
          travel_time_hours: 18,
          booking_url: "https://example.com",
          snapshot_date: date,
          search_error: null
        },
        annotation: {
          flight_id: `AGP-LOP-${date}`,
          weather_score: 4,
          crowd_level: "medium",
          notable_events: [],
          distortion_flag: false,
          distortion_reason: null,
          surf_quality: 4,
          isolation_score: 4,
          personal_flag: "Solid window.",
          raw_reasoning: "reasoning"
        },
        price_vs_baseline_pct: null,
        composite_score: 7.5,
        opportunity_flag: false,
        opportunity_reason: null
      }
    ]
  };
}

test("getBaselines returns median and count per route", () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-history-"));
  const dataDir = join(root, "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "one.json"), JSON.stringify(makeRecord(700, "2026-04-01")));
  writeFileSync(join(dataDir, "two.json"), JSON.stringify(makeRecord(900, "2026-04-02")));
  writeFileSync(join(dataDir, "three.json"), JSON.stringify(makeRecord(800, "2026-04-03")));

  const baselines = getBaselines(dataDir);
  expect(baselines["AGP-LOP"]).toEqual({ median: 800, count: 3 });
});
