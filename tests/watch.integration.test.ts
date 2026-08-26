import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWatch } from "../src/cli/watch";

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-watch-"));
  mkdirSync(join(root, "tmp"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "config", "wishlist.json"), JSON.stringify([
    { destination: "Sal Island, Cape Verde", iata: "SID", status: "scouted", intent_tags: ["surf"], source: "scouted" }
  ]));
  return root;
}

test("runWatch adds a user_requested entry to the wishlist without disturbing scouted entries", () => {
  const root = makeRoot();
  writeFileSync(join(root, "tmp", "watch.update.json"), JSON.stringify([
    {
      destination: "Thailand",
      iata: "BKK",
      intent_tags: ["cultural-travel", "relax"],
      notes: "Eventually want to go, notify on a good deal.",
      requested_by: "555",
      target_budget_eur: { min: null, max: 1500 }
    }
  ]));

  const result = runWatch({ rootDir: root });
  expect(result.added).toEqual(["BKK"]);
  expect(result.count).toBe(2);

  const wishlist = JSON.parse(readFileSync(join(root, "config", "wishlist.json"), "utf8"));
  const thailand = wishlist.find((item: { iata: string }) => item.iata === "BKK");
  expect(thailand.source).toBe("user_requested");
  expect(thailand.requested_by).toBe("555");
  expect(thailand.watch_active).toBe(true);
  expect(thailand.target_budget_eur).toEqual({ min: null, max: 1500 });
  expect(thailand.added_at).toBeDefined();

  const untouched = wishlist.find((item: { iata: string }) => item.iata === "SID");
  expect(untouched.source).toBe("scouted");
});

test("runWatch throws a clear error when the patch file is missing", () => {
  const root = makeRoot();
  expect(() => runWatch({ rootDir: root })).toThrow(/Missing watch patch file/);
});
