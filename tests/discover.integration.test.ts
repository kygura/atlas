import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDiscover } from "../src/cli/discover";

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-discover-"));
  mkdirSync(join(root, "tmp"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "data"), { recursive: true });

  execFileSync("git", ["-C", root, "init"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.email", "atlas@example.com"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.name", "Atlas Test"], { stdio: "ignore" });

  const recentDate = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  writeFileSync(join(root, "config", "wishlist.json"), JSON.stringify([
    { destination: "Sal Island, Cape Verde", iata: "SID", status: "scouted", intent_tags: ["surf"], source: "scouted", last_scouted_at: recentDate }
  ]));
  writeFileSync(join(root, "config", "discovery_weights.json"), JSON.stringify({
    weather_score: 0.3,
    tourism_season_score: 0.3,
    conditions_score: 0.25,
    price_signal: 0.15,
    min_composite_score: 3.0,
    repeat_penalty: 1.5,
    repeat_window_days: 45,
    max_candidates_per_run: 5
  }));

  return root;
}

test("runDiscover scores candidates, upserts the wishlist, and commits a discovery record", () => {
  const root = makeRoot();

  writeFileSync(join(root, "tmp", "discovery_candidates.json"), JSON.stringify([
    {
      destination: "Fogo Island, Cape Verde",
      iata: "SFL",
      profile_id: "surf",
      reason: "Consistent shoulder-season swell, low crowds.",
      intent_tags: ["surf", "remote"],
      avoid_periods: [],
      weather_score: 5,
      conditions_score: 5,
      tourism_season_score: 5,
      price_signal_eur: 320,
      price_signal_note: "Indicative fare from AGP"
    },
    {
      // Same IATA as an entry already in the wishlist scouted 12 days ago —
      // should be repeat-penalized and still be able to pass or fail on its
      // own merits.
      destination: "Sal Island, Cape Verde",
      iata: "SID",
      profile_id: "surf",
      reason: "Kite surfing still decent but past peak.",
      intent_tags: ["surf"],
      avoid_periods: [],
      weather_score: 3,
      conditions_score: 3,
      tourism_season_score: 2,
      price_signal_eur: 900,
      price_signal_note: "Indicative fare from AGP"
    }
  ]));

  const result = runDiscover({ rootDir: root });

  expect(result.scored).toHaveLength(2);
  const sflResult = result.scored.find((c) => c.iata === "SFL");
  const sidResult = result.scored.find((c) => c.iata === "SID");
  expect(sflResult?.repeat_penalty_applied).toBe(false);
  expect(sidResult?.repeat_penalty_applied).toBe(true);

  expect(result.passed.map((c) => c.iata)).toContain("SFL");
  expect(result.commit.committed).toBe(true);

  const wishlist = JSON.parse(readFileSync(join(root, "config", "wishlist.json"), "utf8"));
  const sfl = wishlist.find((item: { iata: string }) => item.iata === "SFL");
  expect(sfl).toBeDefined();
  expect(sfl.source).toBe("scouted");
  expect(sfl.discovery_score).toBeGreaterThan(0);

  const discoveryFiles = readdirSync(join(root, "data", "discovery"));
  expect(discoveryFiles.length).toBe(1);
  const record = JSON.parse(readFileSync(join(root, "data", "discovery", discoveryFiles[0]), "utf8"));
  expect(record.candidates).toHaveLength(2);
  expect(record.passed_iatas).toContain("SFL");

  const results = JSON.parse(readFileSync(join(root, "tmp", "discovery_results.json"), "utf8"));
  expect(results.candidates).toHaveLength(2);

  expect(execFileSync("git", ["-C", root, "log", "--oneline", "-1"], { encoding: "utf8" })).toContain("atlas: record");
});

test("runDiscover throws a clear error when the candidates file is missing", () => {
  const root = makeRoot();
  expect(() => runDiscover({ rootDir: root })).toThrow(/Missing discovery candidates file/);
});
