import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ScanRecordSchema, WatchNotificationsSchema, type ScanRecord } from "../ingestion/schemas";
import { resolveTelegramMessage } from "../delivery/message";
import { markItineraryDelivered } from "../persistence/repo";
import { sendTelegramText } from "../delivery/telegram";
import { resolveRootDir, rootPath } from "../utils/common";

export type DeliverOptions = {
  rootDir?: string;
};

export type WatchNotificationResult = {
  chat_id: string;
  sent: boolean;
  reason?: string;
};

export type DeliverResult = {
  sent: boolean;
  reason?: string;
  committed?: boolean;
  watchNotifications?: WatchNotificationResult[];
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

async function sendWatchNotifications(rootDir: string, botToken: string | undefined): Promise<WatchNotificationResult[] | undefined> {
  const watchNotificationsPath = rootPath(rootDir, "tmp", "watch_notifications.json");
  if (!existsSync(watchNotificationsPath)) {
    return undefined;
  }

  const notifications = WatchNotificationsSchema.parse(JSON.parse(readFileSync(watchNotificationsPath, "utf8")));
  if (!notifications.length) {
    return undefined;
  }

  if (!botToken) {
    return notifications.map((notification) => ({
      chat_id: notification.chat_id,
      sent: false,
      reason: "TELEGRAM_BOT_TOKEN not set"
    }));
  }

  const results: WatchNotificationResult[] = [];
  for (const notification of notifications) {
    try {
      await sendTelegramText(notification.chat_id, notification.text, botToken, {
        parseMode: notification.parse_mode,
        disableWebPagePreview: notification.disable_web_page_preview ?? true
      });
      results.push({ chat_id: notification.chat_id, sent: true });
    } catch (error) {
      results.push({ chat_id: notification.chat_id, sent: false, reason: errorMessage(error) });
    }
  }
  return results;
}

export async function runDeliver(options: DeliverOptions = {}): Promise<DeliverResult> {
  const rootDir = resolveRootDir(options.rootDir);
  const pendingRecord = findLatestUndeliveredRecord(rootPath(rootDir, "data"));

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const watchNotifications = await sendWatchNotifications(rootDir, botToken);

  const chatId = pendingRecord?.record.execution_context?.telegram?.chat_id ?? process.env.ATLAS_TELEGRAM_CHAT_ID;
  if (!chatId || !botToken) {
    return { sent: false, reason: "reply chat_id or TELEGRAM_BOT_TOKEN not set", watchNotifications };
  }

  const itineraryPath = rootPath(rootDir, "tmp", "itinerary.txt");
  const text = existsSync(itineraryPath)
    ? readFileSync(itineraryPath, "utf8").trim()
    : pendingRecord?.record.itinerary_text.trim() ?? "";
  if (!text) {
    return { sent: false, reason: "tmp/itinerary.txt is empty and no persisted itinerary is available", watchNotifications };
  }

  // Reply-thread any run triggered from Telegram (query or an on-demand
  // /discover) — only a schedule-triggered run has no message to reply to.
  const replyToMessageId = pendingRecord?.record.run_mode !== "scheduled"
    ? pendingRecord?.record.execution_context?.telegram?.message_id ?? undefined
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
      reason: `native Telegram delivery failed (${errorMessage(error)}); use Composio MCP fallback`,
      watchNotifications
    };
  }

  if (pendingRecord) {
    const commit = markItineraryDelivered(rootDir, pendingRecord.filePath);
    return { sent: true, committed: commit.committed, watchNotifications };
  }

  return { sent: true, committed: false, watchNotifications };
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const result = await runDeliver();
  if (result.watchNotifications?.length) {
    const sent = result.watchNotifications.filter((n) => n.sent).length;
    console.log(`Watchlist notifications: ${sent}/${result.watchNotifications.length} sent.`);
  }
  if (!result.sent) {
    console.error(`Delivery skipped: ${result.reason}`);
    process.exit(1);
  }
  console.log(`Itinerary sent via Telegram.${result.committed ? " Marked delivered in data/." : ""}`);
}
