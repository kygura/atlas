import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { runDeliver } from "../src/cli/deliver";

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-deliver-"));
  mkdirSync(join(root, "tmp"), { recursive: true });
  mkdirSync(join(root, "data"), { recursive: true });
  execFileSync("git", ["-C", root, "init"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.email", "atlas@example.com"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.name", "Atlas Test"], { stdio: "ignore" });
  return root;
}

function writeScanRecord(root: string, fileName: string, delivered: boolean): void {
  const record = {
    scan_date: "2026-04-22",
    run_mode: "scheduled",
    origin_resolved: "AGP",
    query: null,
    results: [],
    itinerary_delivered: delivered,
    itinerary_text: "ATLAS — test"
  };
  const filePath = join(root, "data", fileName);
  writeFileSync(filePath, JSON.stringify(record, null, 2) + "\n", "utf8");
  execFileSync("git", ["-C", root, "add", filePath], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "commit", "-m", "init record"], { stdio: "ignore" });
}

afterEach(() => {
  mock.restore();
  delete process.env.ATLAS_TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
});

test("runDeliver returns sent:false when env vars are missing", async () => {
  const root = makeRoot();
  const result = await runDeliver({ rootDir: root });
  expect(result.sent).toBe(false);
  expect(result.reason).toContain("TELEGRAM_BOT_TOKEN");
});

test("runDeliver returns sent:false when itinerary.txt is missing", async () => {
  const root = makeRoot();
  process.env.ATLAS_TELEGRAM_CHAT_ID = "123";
  process.env.TELEGRAM_BOT_TOKEN = "token";

  const result = await runDeliver({ rootDir: root });
  expect(result.sent).toBe(false);
  expect(result.reason).toContain("itinerary.txt");
});

test("runDeliver sends itinerary and marks record delivered", async () => {
  const root = makeRoot();
  process.env.ATLAS_TELEGRAM_CHAT_ID = "123";
  process.env.TELEGRAM_BOT_TOKEN = "token";

  writeFileSync(join(root, "tmp", "itinerary.txt"), "ATLAS — 2026-04-22 · from AGP\n", "utf8");
  writeScanRecord(root, "2026-04-22-scheduled.json", false);

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const result = await runDeliver({ rootDir: root });

  expect(result.sent).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const saved = JSON.parse(readFileSync(join(root, "data", "2026-04-22-scheduled.json"), "utf8"));
  expect(saved.itinerary_delivered).toBe(true);
  expect(result.committed).toBe(true);
});

test("runDeliver does not mark already-delivered records", async () => {
  const root = makeRoot();
  process.env.ATLAS_TELEGRAM_CHAT_ID = "123";
  process.env.TELEGRAM_BOT_TOKEN = "token";

  writeFileSync(join(root, "tmp", "itinerary.txt"), "ATLAS — 2026-04-22 · from AGP\n", "utf8");
  writeScanRecord(root, "2026-04-22-scheduled.json", true);

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const result = await runDeliver({ rootDir: root });

  expect(result.sent).toBe(true);
  expect(result.committed).toBe(false);
});
