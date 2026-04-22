const TELEGRAM_API = "https://api.telegram.org";
const MAX_MESSAGE_LENGTH = 4096;
const MAX_CAPTION_LENGTH = 1024;

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

export async function sendTelegramText(chatId: string, text: string, botToken: string): Promise<void> {
  const chunks = splitText(text);
  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
    }
  }
}

export async function sendTelegramPhoto(chatId: string, photo: string, caption: string, botToken: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo, caption: caption.slice(0, MAX_CAPTION_LENGTH) })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendPhoto failed: ${res.status} ${body}`);
  }
}
