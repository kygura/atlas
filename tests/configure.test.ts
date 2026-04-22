import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConfigure } from "../src/cli/configure";
import { readHardFilters } from "../src/config/hard_filters";

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-configure-"));
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "tmp"), { recursive: true });
  writeFileSync(join(root, "config", "hard_filters.json"), JSON.stringify({
    max_stops: 2,
    max_travel_time_hours: 50,
    max_layover_wait_hours: 6,
    budget_economy_eur: { min: 10, max: 2500 },
    fallback_origins: ["AGP", "MAD"],
    lastminute_window_days: 21
  }, null, 2));
  return root;
}

test("runConfigure applies a hard filter patch from tmp for model-authored updates", () => {
  const root = makeRoot();
  const patchPath = join(root, "tmp", "hard_filters.update.json");
  writeFileSync(patchPath, JSON.stringify({
    max_layover_wait_hours: 4,
    max_travel_time_hours: 36,
    budget_economy_eur: { max: 1800 }
  }, null, 2));

  const result = runConfigure({ rootDir: root });
  const saved = readHardFilters(root);

  expect(result.patchPath).toBe(patchPath);
  expect(saved.max_layover_wait_hours).toBe(4);
  expect(saved.max_travel_time_hours).toBe(36);
  expect(saved.budget_economy_eur.min).toBe(10);
  expect(saved.budget_economy_eur.max).toBe(1800);
});
