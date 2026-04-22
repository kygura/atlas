import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ScanRecordSchema, type ScanRecord } from "../ingestion/schemas";
import { resolveTelegramMessage } from "../delivery/message";
import { markItineraryDelivered } from "../persistence/repo";
import { sendTelegramText } from "../delivery/telegram";
import { resolveRootDir, rootPath } from "../utils/common";

export type DeliverOptions = {
  rootDir?: string;
};

export type DeliverResult = {
  sent: boolean;
  reason?: string;
  committed?: boolean;
};

type PendingRecord = {
  filePath: string;
  record: ScanRecord;
};

function findLatestUndeliveredRecord(dataDir: string): PendingRecord | null {
  if (!existsSync(dataDir)) {
    return null;
  }
  const files = readdirSync(dataDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  for (const file of files) {
    const filePath = join(dataDir, file);
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      const record = ScanRecordSchema.parse(raw);
      if (!record.itinerary_delivered) {
        return { filePath, record };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function runDeliver(options: DeliverOptions = {}): Promise<DeliverResult> {
  const rootDir = resolveRootDir(options.rootDir);
  const pendingRecord = findLatestUndeliveredRecord(rootPath(rootDir, "data"));

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = pendingRecord?.record.execution_context?.telegram?.chat_id ?? process.env.ATLAS_TELEGRAM_CHAT_ID;
  if (!chatId || !botToken) {
    return { sent: false, reason: "reply chat_id or TELEGRAM_BOT_TOKEN not set" };
  }

  const itineraryPath = rootPath(rootDir, "tmp", "itinerary.txt");
  const text = existsSync(itineraryPath)
    ? readFileSync(itineraryPath, "utf8").trim()
    : pendingRecord?.record.itinerary_text.trim() ?? "";
  if (!text) {
    return { sent: false, reason: "tmp/itinerary.txt is empty and no persisted itinerary is available" };
  }

  const replyToMessageId = pendingRecord?.record.run_mode === "query"
    ? pendingRecord.record.execution_context?.telegram?.message_id ?? undefined
    : undefined;
  const message = resolveTelegramMessage(rootDir, pendingRecord?.record ?? null, text);

  try {
    await sendTelegramText(chatId, message.text, botToken, {
      replyToMessageId,
      parseMode: message.parse_mode,
      disableWebPagePreview: message.disable_web_page_preview ?? true
    });
  } catch (error) {
    return {
      sent: false,
      reason: `native Telegram delivery failed (${errorMessage(error)}); use Composio MCP fallback`
    };
  }

  if (pendingRecord) {
    const commit = markItineraryDelivered(rootDir, pendingRecord.filePath);
    return { sent: true, committed: commit.committed };
  }

  return { sent: true, committed: false };
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const result = await runDeliver();
  if (!result.sent) {
    console.error(`Delivery skipped: ${result.reason}`);
    process.exit(1);
  }
  console.log(`Itinerary sent via Telegram.${result.committed ? " Marked delivered in data/." : ""}`);
}
