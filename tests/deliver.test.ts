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

function writeScanRecord(
  root: string,
  fileName: string,
  delivered: boolean,
  overrides: Record<string, unknown> = {}
): void {
  const record = {
    scan_date: "2026-04-22",
    run_mode: "scheduled",
    origin_resolved: "AGP",
    query: null,
    results: [],
    itinerary_delivered: delivered,
    itinerary_text: "ATLAS — test",
    ...overrides
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
  delete process.env.ATLAS_TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
  const result = await runDeliver({ rootDir: root });
  expect(result.sent).toBe(false);
  expect(result.reason).toContain("TELEGRAM_BOT_TOKEN");
});

test("runDeliver returns sent:false when itinerary.txt is missing", async () => {
  const root = makeRoot();
  process.env.ATLAS_TELEGRAM_CHAT_ID = "123";
  process.env.TELEGRAM_BOT_TOKEN = "token";
  writeScanRecord(root, "2026-04-22-scheduled.json", false, { itinerary_text: "" });

  const result = await runDeliver({ rootDir: root });
  expect(result.sent).toBe(false);
  expect(result.reason).toContain("no persisted itinerary");
});

test("runDeliver sends itinerary and marks record delivered", async () => {
  const root = makeRoot();
  process.env.ATLAS_TELEGRAM_CHAT_ID = "123";
  process.env.TELEGRAM_BOT_TOKEN = "token";

  writeFileSync(join(root, "tmp", "itinerary.txt"), "ATLAS — 2026-04-22 · from AGP\n", "utf8");
  writeFileSync(join(root, "tmp", "telegram_message.json"), JSON.stringify({
    text: "*ATLAS*",
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true
  }), "utf8");
  writeScanRecord(root, "2026-04-22-scheduled.json", false);

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const result = await runDeliver({ rootDir: root });

  expect(result.sent).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string);
  expect(body.parse_mode).toBe("MarkdownV2");
  expect(body.text).toBe("*ATLAS*");

  const saved = JSON.parse(readFileSync(join(root, "data", "2026-04-22-scheduled.json"), "utf8"));
  expect(saved.itinerary_delivered).toBe(true);
  expect(result.committed).toBe(true);
});

test("runDeliver replies to the Telegram source chat and can use persisted itinerary text", async () => {
  const root = makeRoot();
  process.env.TELEGRAM_BOT_TOKEN = "token";

  writeScanRecord(root, "2026-04-22-query.json", false, {
    run_mode: "query",
    query: "surf and isolation",
    itinerary_text: "ATLAS — persisted reply\n",
    execution_context: {
      trigger_source: "telegram",
      origin_interface: "telegram",
      request_text: "surf and isolation",
      defaulted_params: [],
      context_summary: ["budget under €1200"],
      resolved_origin: "AGP",
      user_context: {
        location_label: "Malaga",
        preferred_origins: ["AGP"],
        max_budget_eur: 1200,
        destination_focus: ["Lombok"],
        preference_tags: ["surf"],
        notes: []
      },
      telegram: {
        chat_id: "987",
        message_id: 654,
        user_id: 1,
        username: "origin_user",
        language_code: "en",
        photo_file_id: null,
        location: null
      }
    }
  });

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const result = await runDeliver({ rootDir: root });

  expect(result.sent).toBe(true);
  const body = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string);
  expect(body.chat_id).toBe("987");
  expect(body.reply_to_message_id).toBe(654);
  expect(body.text).toContain("persisted reply");
});

test("runDeliver returns a Composio fallback reason when native Telegram delivery fails", async () => {
  const root = makeRoot();
  process.env.ATLAS_TELEGRAM_CHAT_ID = "123";
  process.env.TELEGRAM_BOT_TOKEN = "token";

  writeFileSync(join(root, "tmp", "itinerary.txt"), "ATLAS — 2026-04-22 · from AGP\n", "utf8");
  writeFileSync(join(root, "tmp", "telegram_message.json"), JSON.stringify({
    text: "*ATLAS*",
    parse_mode: "MarkdownV2"
  }), "utf8");
  writeScanRecord(root, "2026-04-22-scheduled.json", false);

  const fetchMock = mock(() => Promise.resolve(new Response("can't parse entities", { status: 400 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const result = await runDeliver({ rootDir: root });

  expect(result.sent).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.reason).toContain("Composio MCP fallback");
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
