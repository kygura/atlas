import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTelegramMessage } from "../src/delivery/message";
import type { ScanRecord } from "../src/ingestion/schemas";

test("resolveTelegramMessage prefers tmp/telegram_message.json", () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-message-"));
  mkdirSync(join(root, "tmp"), { recursive: true });
  writeFileSync(join(root, "tmp", "telegram_message.json"), JSON.stringify({
    text: "<b>Atlas</b>",
    parse_mode: "HTML",
    disable_web_page_preview: false
  }), "utf8");

  const message = resolveTelegramMessage(root, null, "fallback");
  expect(message).toEqual({
    text: "<b>Atlas</b>",
    parse_mode: "HTML",
    disable_web_page_preview: false
  });
});

test("resolveTelegramMessage falls back to persisted message and then itinerary text", () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-message-"));
  const record: ScanRecord = {
    scan_date: "2026-04-22",
    run_mode: "query",
    origin_resolved: "AGP",
    query: "surf",
    results: [],
    itinerary_delivered: false,
    itinerary_text: "ATLAS — persisted",
    telegram_message: {
      text: "*Atlas*",
      parse_mode: "MarkdownV2"
    }
  };

  expect(resolveTelegramMessage(root, record, "fallback")).toEqual({
    text: "*Atlas*",
    parse_mode: "MarkdownV2"
  });

  expect(resolveTelegramMessage(root, null, "fallback")).toEqual({
    text: "fallback",
    disable_web_page_preview: true
  });
});
