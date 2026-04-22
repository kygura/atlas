import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ScanRecordSchema } from "../ingestion/schemas";
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

function findLatestUndeliveredRecord(dataDir: string): string | null {
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
        return filePath;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function runDeliver(options: DeliverOptions = {}): Promise<DeliverResult> {
  const rootDir = resolveRootDir(options.rootDir);

  const chatId = process.env.ATLAS_TELEGRAM_CHAT_ID;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !botToken) {
    return { sent: false, reason: "ATLAS_TELEGRAM_CHAT_ID or TELEGRAM_BOT_TOKEN not set" };
  }

  const itineraryPath = rootPath(rootDir, "tmp", "itinerary.txt");
  if (!existsSync(itineraryPath)) {
    return { sent: false, reason: "tmp/itinerary.txt not found" };
  }
  const text = readFileSync(itineraryPath, "utf8").trim();
  if (!text) {
    return { sent: false, reason: "tmp/itinerary.txt is empty" };
  }

  await sendTelegramText(chatId, text, botToken);

  const recordPath = findLatestUndeliveredRecord(rootPath(rootDir, "data"));
  if (recordPath) {
    const commit = markItineraryDelivered(rootDir, recordPath);
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
