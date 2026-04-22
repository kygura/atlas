import { afterEach, expect, mock, test } from "bun:test";
import { sendTelegramText, sendTelegramPhoto } from "../src/delivery/telegram";

const CHAT_ID = "123456";
const TOKEN = "bot-token";

afterEach(() => {
  mock.restore();
});

test("sendTelegramText sends a single message for short text", async () => {
  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  await sendTelegramText(CHAT_ID, "Hello world", TOKEN);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const call = (fetchMock.mock.calls as unknown[][])[0];
  const body = JSON.parse((call[1] as RequestInit).body as string);
  expect(body.chat_id).toBe(CHAT_ID);
  expect(body.text).toBe("Hello world");
});

test("sendTelegramText splits text longer than 4096 chars", async () => {
  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const paragraph = "A".repeat(100);
  const text = Array.from({ length: 50 }, () => paragraph).join("\n\n");

  await sendTelegramText(CHAT_ID, text, TOKEN);

  expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  for (const call of fetchMock.mock.calls as unknown[][]) {
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.text.length).toBeLessThanOrEqual(4096);
  }
});

test("sendTelegramText throws on non-ok response", async () => {
  const fetchMock = mock(() => Promise.resolve(new Response("Bad Request", { status: 400 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  await expect(sendTelegramText(CHAT_ID, "Hi", TOKEN)).rejects.toThrow("Telegram sendMessage failed: 400");
});

test("sendTelegramPhoto sends photo with caption", async () => {
  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  await sendTelegramPhoto(CHAT_ID, "file_id_abc", "A caption", TOKEN);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string);
  expect(body.photo).toBe("file_id_abc");
  expect(body.caption).toBe("A caption");
  expect(body.chat_id).toBe(CHAT_ID);
});

test("sendTelegramPhoto truncates caption to 1024 chars", async () => {
  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const longCaption = "C".repeat(2000);
  await sendTelegramPhoto(CHAT_ID, "file_id", longCaption, TOKEN);

  const body = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string);
  expect(body.caption.length).toBe(1024);
});

test("sendTelegramPhoto throws on non-ok response", async () => {
  const fetchMock = mock(() => Promise.resolve(new Response("Bad Request", { status: 400 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  await expect(sendTelegramPhoto(CHAT_ID, "file_id", "caption", TOKEN)).rejects.toThrow("Telegram sendPhoto failed: 400");
});
