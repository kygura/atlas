import { existsSync, readFileSync } from "node:fs";
import { TelegramOutboundMessageSchema, type ScanRecord, type TelegramOutboundMessage } from "../ingestion/schemas";
import { rootPath } from "../utils/common";

export function readTelegramMessage(rootDir: string): TelegramOutboundMessage | null {
  const filePath = rootPath(rootDir, "tmp", "telegram_message.json");
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  return TelegramOutboundMessageSchema.parse(raw);
}

export function resolveTelegramMessage(
  rootDir: string,
  record: ScanRecord | null,
  fallbackText: string
): TelegramOutboundMessage {
  const fileMessage = readTelegramMessage(rootDir);
  if (fileMessage) {
    return fileMessage;
  }

  if (record?.telegram_message) {
    return TelegramOutboundMessageSchema.parse(record.telegram_message);
  }

  return TelegramOutboundMessageSchema.parse({
    text: fallbackText,
    disable_web_page_preview: true
  });
}
