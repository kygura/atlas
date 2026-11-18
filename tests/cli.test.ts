import { expect, test } from "bun:test";
import { runCli, getAtPath, nestedPatch, parseConfigValue, type CliDeps } from "../src/cli/atlas";
import { MeridianError, type MeridianClient } from "../src/meridian/client";

function harness(client: Partial<MeridianClient> = {}, files: Record<string, string> = {}, stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = {
    out: (t) => void out.push(t),
    err: (t) => void err.push(t),
    readFile: (p) => {
      if (!(p in files)) throw new Error(`ENOENT ${p}`);
      return files[p] as string;
    },
    readStdin: async () => stdin,
    env: {},
    cwd: () => process.cwd(),
    makeClient: () => ({ baseUrl: "https://m.example", ...client }) as MeridianClient
  };
  return { deps, out, err };
}

test("help and no arguments print usage and exit 0", async () => {
  for (const argv of [[], ["help"], ["scan", "--help"]]) {
    const h = harness();
    expect(await runCli(argv, h.deps)).toBe(0);
    expect(h.out.join("\n")).toContain("Usage: bun run atlas");
  }
});

test("an unknown command exits 1 with a message on stderr", async () => {
  const h = harness();
  expect(await runCli(["frobnicate"], h.deps)).toBe(1);
  expect(h.err.join("\n")).toContain('Unknown command "frobnicate"');
});

test("config set builds a nested partial and PATCHes it", async () => {
  let sent: unknown;
  const h = harness({
    patchConfig: async (p: unknown) => {
      sent = p;
      return { config: { hardFilters: { maxStops: 3 } } as never, updatedAt: "now" };
    }
  });
  expect(await runCli(["config", "set", "hardFilters.maxStops", "3"], h.deps)).toBe(0);
  expect(sent).toEqual({ hardFilters: { maxStops: 3 } });
  expect(h.out.join("\n")).toContain("Set hardFilters.maxStops = 3");
});

test("config helpers", () => {
  expect(nestedPatch("a.b.c", [1])).toEqual({ a: { b: { c: [1] } } });
  expect(parseConfigValue('{"min":1}')).toEqual({ min: 1 });
  expect(parseConfigValue("boutique")).toBe("boutique");
  expect(getAtPath({ a: { b: 2 } }, "a.b")).toBe(2);
  expect(() => getAtPath({ a: 1 }, "a.b")).toThrow();
});

test("wishlist add and watch build entries from flags", async () => {
  const sent: unknown[] = [];
  const h = harness({
    upsertWishlist: async (entries: unknown) => {
      sent.push(entries);
      return { entries: [], unresolved: [{ place: { query: "x" }, reason: "no match" }] };
    }
  });
  await runCli(["wishlist", "add", "Lisbon", "--tags", "surf,coast", "--avoid", "7,8", "--notes", "windy", "--scouted"], h.deps);
  await runCli(["watch", "BKK", "--budget", "<1500", "--chat", "42"], h.deps);
  expect(sent[0]).toEqual([
    { place: { query: "Lisbon" }, source: "scouted", intentTags: ["surf", "coast"], avoidMonths: [7, 8], notes: "windy" }
  ]);
  expect(sent[1]).toEqual([{ place: { iata: "BKK" }, source: "wished", watch: { active: true, targetBudgetEur: { max: 1500 }, chatId: "42" } }]);
});

test("wishlist add --unwatch turns the watch off", async () => {
  const sent: unknown[] = [];
  const h = harness({
    upsertWishlist: async (entries: unknown) => {
      sent.push(entries);
      return { entries: [], unresolved: [] };
    }
  });
  await runCli(["wishlist", "add", "BKK", "--unwatch"], h.deps);
  expect(sent[0]).toEqual([{ place: { iata: "BKK" }, source: "wished", watch: { active: false } }]);
});

test("an unresolved place exits 1", async () => {
  const h = harness({ upsertWishlist: async () => ({ entries: [], unresolved: [{ place: { query: "Zzz" }, reason: "no match" }] }) });
  expect(await runCli(["wishlist", "add", "Zzz"], h.deps)).toBe(1);
  expect(h.out.join("\n")).toContain("Not resolved: Zzz");
});

test("scan reads a file, posts it and prints a table", async () => {
  let sent: unknown;
  const h = harness(
    {
      scan: async (input: unknown) => {
        sent = input;
        return {
          runId: "run1",
          scored: [
            {
              flight: { id: "MAD-LIS-1", destinationName: "Lisbon", priceEur: 80 },
              annotation: { distortion: false },
              baseline: { route: "MAD-LIS", median: 120, p25: 100, count: 5, thin: false },
              priceVsMedianPct: -33.3,
              composite: 7.9,
              opportunity: true,
              opportunityReason: "price under 85% of median",
              baselineDeal: true,
              gates: { passed: true, failures: [], warnings: [] }
            }
          ],
          rejected: [{ flight: { id: "MAD-X-1", priceEur: 3000 }, reasons: ["over budget"] }],
          watchHits: [],
          selection: { top: "MAD-LIS-1", alternative: null }
        } as never;
      }
    },
    { "scan.json": '{"mode":"scheduled","origin":"MAD","flights":[],"annotations":[]}' }
  );
  expect(await runCli(["scan", "scan.json"], h.deps)).toBe(0);
  expect(sent).toEqual({ mode: "scheduled", origin: "MAD", flights: [], annotations: [] });
  const text = h.out.join("\n");
  expect(text).toContain("-33.3%");
  expect(text).toContain("baseline deal, opportunity");
  expect(text).toContain("Selection: top MAD-LIS-1");
  expect(text).toContain("over budget");
});

test("scan --json prints the raw response", async () => {
  const response = { runId: "r", scored: [], rejected: [], watchHits: [], selection: { top: null, alternative: null } };
  const h = harness({ scan: async () => response as never }, {}, '{"mode":"query","origin":"MAD","flights":[],"annotations":[]}');
  expect(await runCli(["scan", "-", "--json"], h.deps)).toBe(0);
  expect(JSON.parse(h.out.join("\n"))).toEqual(response);
});

test("notify builds a payload from flags and a body file", async () => {
  let sent: unknown;
  const h = harness(
    {
      notify: async (i: unknown) => {
        sent = i;
        return { notice: {}, deduped: false, deliveries: [{ channel: "telegram", ok: true }] };
      }
    },
    { "digest.txt": "Three deals this week." }
  );
  expect(await runCli(["notify", "--kind", "digest", "--title", "Weekly digest", "--body-file", "digest.txt", "--dedupe-key", "wk1"], h.deps)).toBe(0);
  expect(sent).toEqual({ kind: "digest", title: "Weekly digest", body: "Three deals this week.", dedupeKey: "wk1" });
  expect(await runCli(["notify", "--kind", "bogus", "--title", "x"], h.deps)).toBe(1);
});

test("server errors exit 1 with the message and body on stderr", async () => {
  const h = harness({
    runs: async () => {
      throw new MeridianError(401, { error: "unauthorized" }, "GET /api/atlas/runs failed: 401 unauthorized");
    }
  });
  expect(await runCli(["runs"], h.deps)).toBe(1);
  const text = h.err.join("\n");
  expect(text).toContain("401 unauthorized");
  expect(text).toContain('"error": "unauthorized"');
});

test("import --dry-run needs no credentials and sends nothing", async () => {
  const h = harness();
  h.deps.makeClient = () => {
    throw new Error("client must not be created");
  };
  expect(await runCli(["import", "--dry-run", "--dir", "legacy"], h.deps)).toBe(0);
  expect(h.out.join("\n")).toContain("Dry run, nothing sent.");
});
