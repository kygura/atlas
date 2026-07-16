import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TELEGRAM_API = "https://api.telegram.org";
const MAX_MESSAGE_LENGTH = 4096;
const MAX_CAPTION_LENGTH = 1024;

export type TelegramSendOptions = {
  replyToMessageId?: number;
  parseMode?: "MarkdownV2" | "HTML";
  disableWebPagePreview?: boolean;
};

// Some sandboxed runtimes route outbound HTTPS through a CONNECT proxy that
// Bun's fetch fails to complete a TLS handshake through, even though the
// proxy and its CA are otherwise trusted (curl through the same proxy works).
// Fall back to curl, which already honors the standard *_PROXY/*_CA_BUNDLE
// env vars on its own, so this is a no-op on networks without a proxy.
async function postJson(url: string, body: unknown): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: res.status, text: await res.text() };
  } catch (fetchError) {
    try {
      const { stdout } = await execFileAsync("curl", [
        "-sS",
        "-X", "POST",
        url,
        "-H", "Content-Type: application/json",
        "-d", JSON.stringify(body),
        "-w", "\n%{http_code}"
      ]);
      const lastNewline = stdout.lastIndexOf("\n");
      const status = Number(stdout.slice(lastNewline + 1));
      const text = stdout.slice(0, lastNewline);
      return { status, text };
    } catch (curlError) {
      throw fetchError instanceof Error ? fetchError : curlError;
    }
  }
}

function splitText(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) {
    return [text];
  }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_MESSAGE_LENGTH) {
    let cut = remaining.lastIndexOf("\n\n", MAX_MESSAGE_LENGTH);
    if (cut <= 0) {
      cut = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    }
    if (cut <= 0) {
      cut = MAX_MESSAGE_LENGTH;
    }
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length) {
    chunks.push(remaining);
  }
  return chunks;
}

export async function sendTelegramText(
  chatId: string,
  text: string,
  botToken: string,
  options: TelegramSendOptions = {}
): Promise<void> {
  const chunks = splitText(text);
  for (const chunk of chunks) {
    const { status, text: body } = await postJson(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: chunk,
      ...(options.replyToMessageId ? { reply_to_message_id: options.replyToMessageId } : {}),
      ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
      ...(options.disableWebPagePreview ? { link_preview_options: { is_disabled: true } } : {})
    });
    if (status < 200 || status >= 300) {
      throw new Error(`Telegram sendMessage failed: ${status} ${body}`);
    }
  }
}

export async function sendTelegramPhoto(
  chatId: string,
  photo: string,
  caption: string,
  botToken: string,
  options: TelegramSendOptions = {}
): Promise<void> {
  const { status, text: body } = await postJson(`${TELEGRAM_API}/bot${botToken}/sendPhoto`, {
    chat_id: chatId,
    photo,
    caption: caption.slice(0, MAX_CAPTION_LENGTH),
    ...(options.replyToMessageId ? { reply_to_message_id: options.replyToMessageId } : {}),
    ...(options.parseMode ? { parse_mode: options.parseMode } : {})
  });
  if (status < 200 || status >= 300) {
    throw new Error(`Telegram sendPhoto failed: ${status} ${body}`);
  }
}
