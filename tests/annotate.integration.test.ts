import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAnnotate } from "../src/cli/annotate";

test("runAnnotate scores, writes data, commits scan record, and persists itinerary text", () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-annotate-"));
  mkdirSync(join(root, "tmp"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "data"), { recursive: true });

  execFileSync("git", ["-C", root, "init"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.email", "atlas@example.com"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.name", "Atlas Test"], { stdio: "ignore" });

  writeFileSync(join(root, "config", "wishlist.json"), JSON.stringify([
    { destination: "Lombok", iata: "LOP", status: "active", intent_tags: ["surf"], notes: "note" }
  ]));
  writeFileSync(join(root, "config", "scoring_weights.json"), JSON.stringify({
    price_vs_baseline: 0.3,
    weather_score: 0.25,
    crowd_level: 0.25,
    surf_quality: 0.15,
    isolation_score: 0.05,
    opportunity_threshold: 7.5
  }));

  writeFileSync(join(root, "tmp", "flight_results.json"), JSON.stringify([
    {
      flight_id: "AGP-LOP-2026-05-10",
      source: "kiwi",
      origin: "AGP",
      destination: "LOP",
      destination_name: "Lombok",
      travel_window_start: "2026-05-10",
      travel_window_end: "2026-05-24",
      days_out: 18,
      price_economy_eur: 650,
      price_business_eur: null,
      stops: 1,
      best_layover: "SIN",
      travel_time_hours: 18,
      booking_url: "https://example.com/book",
      snapshot_date: "2026-04-22",
      search_error: null
    }
  ]));

  writeFileSync(join(root, "tmp", "annotations.json"), JSON.stringify([
    {
      flight_id: "AGP-LOP-2026-05-10",
      weather_score: 5,
      crowd_level: "low",
      notable_events: [],
      distortion_flag: false,
      distortion_reason: null,
      surf_quality: 4,
      isolation_score: 5,
      personal_flag: "Notable surf window.",
      raw_reasoning: "reasoning"
    }
  ]));
  writeFileSync(join(root, "tmp", "execution_context.json"), JSON.stringify({
    trigger_source: "telegram",
    origin_interface: "telegram",
    request_text: "surf and isolation under €700",
    defaulted_params: ["trip length"],
    context_summary: ["budget under €700"],
    resolved_origin: "AGP",
    user_context: {
      location_label: "Malaga",
      preferred_origins: ["AGP", "MAD"],
      max_budget_eur: 700,
      destination_focus: ["Lombok"],
      preference_tags: ["surf", "isolation"],
      notes: []
    },
    telegram: {
      chat_id: "123",
      message_id: 99,
      user_id: 77,
      username: "atlas_user",
      language_code: "en",
      photo_file_id: null,
      location: null
    }
  }));

  const result = runAnnotate({ rootDir: root, mode: "query" });
  expect(result.scored).toHaveLength(1);
  expect(result.commit.committed).toBe(true);
  expect(result.record.itinerary_text).toContain("ATLAS —");
  expect(result.record.query).toBe("surf and isolation under €700");
  expect(result.record.execution_context?.telegram?.chat_id).toBe("123");
  expect(readFileSync(join(root, "tmp", "scored_results.json"), "utf8")).toContain("composite_score");
  const dataFile = readdirSync(join(root, "data")).find((entry) => entry.endsWith(".json"));
  expect(dataFile).toBeDefined();
  if (dataFile) {
    expect(readFileSync(join(root, "data", dataFile), "utf8")).toContain("itinerary_text");
  }
  expect(execFileSync("git", ["-C", root, "log", "--oneline", "-1"], { encoding: "utf8" })).toContain("atlas: record");
});
