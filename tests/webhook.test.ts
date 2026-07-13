import { afterEach, expect, mock, test } from "bun:test";
import handler from "../api/trigger";

function makeRes() {
  let statusCode = 0;
  let payload: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      payload = body;
      return body;
    },
    get statusCode() {
      return statusCode;
    },
    get payload() {
      return payload;
    }
  };
  return res;
}

afterEach(() => {
  mock.restore();
  delete process.env.ROUTINE_FIRE_URL;
  delete process.env.ROUTINE_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
});

test("handler forwards message text and returns ok", async () => {
  process.env.ROUTINE_FIRE_URL = "https://example.com/fire";
  process.env.ROUTINE_TOKEN = "secret";

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const res = makeRes();
  await handler({
    body: {
      message: {
        text: "surf and isolation",
        chat: { id: 999 },
        message_id: 123,
        from: { id: 55, username: "atlas_user", language_code: "en" }
      }
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(res.payload).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string);
  expect(body.text).toBe("surf and isolation");
  expect(body.photo_file_id).toBeUndefined();
  expect(body.execution_context.telegram).toEqual({
    chat_id: "999",
    message_id: 123,
    user_id: 55,
    username: "atlas_user",
    language_code: "en",
    photo_file_id: null,
    location: null
  });
});

test("handler forwards photo file_id and caption", async () => {
  process.env.ROUTINE_FIRE_URL = "https://example.com/fire";
  process.env.ROUTINE_TOKEN = "secret";

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const res = makeRes();
  await handler({
    body: {
      message: {
        caption: "find me a flight like this",
        chat: { id: 321 },
        message_id: 77,
        from: { id: 44, username: "photo_user", language_code: "en" },
        photo: [
          { file_id: "small_id", width: 90, height: 90 },
          { file_id: "large_id", width: 1280, height: 720 }
        ]
      }
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string);
  expect(body.text).toBe("find me a flight like this");
  expect(body.photo_file_id).toBe("large_id");
  expect(body.execution_context.telegram.photo_file_id).toBe("large_id");
});

test("handler forwards photo-only message (no caption)", async () => {
  process.env.ROUTINE_FIRE_URL = "https://example.com/fire";
  process.env.ROUTINE_TOKEN = "secret";

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const res = makeRes();
  await handler({
    body: {
      message: {
        photo: [{ file_id: "img_id", width: 800, height: 600 }]
      }
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string);
  expect(body.photo_file_id).toBe("img_id");
  expect(body.execution_context.request_text).toBeNull();
});

test("handler drops empty message with no photo", async () => {
  process.env.ROUTINE_FIRE_URL = "https://example.com/fire";
  process.env.ROUTINE_TOKEN = "secret";

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const res = makeRes();
  await handler({ body: { message: {} } }, res);

  expect(res.statusCode).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(0);
});

test("handler answers /help directly via Telegram and does not fire the routine", async () => {
  process.env.ROUTINE_FIRE_URL = "https://example.com/fire";
  process.env.ROUTINE_TOKEN = "secret";
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const res = makeRes();
  await handler({
    body: {
      message: {
        text: "/help",
        chat: { id: 777 },
        message_id: 5,
        from: { id: 1, username: "someone", language_code: "en" }
      }
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const call = (fetchMock.mock.calls as unknown[][])[0];
  expect(call[0]).toBe("https://api.telegram.org/botbot-token/sendMessage");
  const body = JSON.parse((call[1] as RequestInit).body as string);
  expect(body.chat_id).toBe("777");
  expect(body.text).toContain("Atlas commands");
  expect(body.reply_to_message_id).toBe(5);
});

test("handler parses /scout arguments into structured execution_context fields", async () => {
  process.env.ROUTINE_FIRE_URL = "https://example.com/fire";
  process.env.ROUTINE_TOKEN = "secret";

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const res = makeRes();
  await handler({
    body: {
      message: {
        text: "/scout destination:Portugal activity:surf,relax days:7-10 budget:800-1500 origin:MAD",
        chat: { id: 555 },
        message_id: 9,
        from: { id: 2, username: "steerer", language_code: "en" }
      }
    }
  }, res);

  expect(res.statusCode).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string);

  expect(body.execution_context.command).toEqual({
    name: "scout",
    raw_args: "destination:Portugal activity:surf,relax days:7-10 budget:800-1500 origin:MAD"
  });
  expect(body.execution_context.resolved_origin).toBe("MAD");
  expect(body.execution_context.user_context.destination_focus).toEqual(["Portugal"]);
  expect(body.execution_context.user_context.activity_types).toEqual(["surf", "relax"]);
  expect(body.execution_context.user_context.stay_duration_days).toEqual({ min: 7, max: 10 });
  expect(body.execution_context.user_context.budget_range_eur).toEqual({ min: 800, max: 1500 });
  expect(body.execution_context.user_context.max_budget_eur).toBe(1500);
  expect(body.execution_context.user_context.preferred_origins).toEqual(["MAD"]);
});

test("handler forwards freeform text with no command field", async () => {
  process.env.ROUTINE_FIRE_URL = "https://example.com/fire";
  process.env.ROUTINE_TOKEN = "secret";

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const res = makeRes();
  await handler({
    body: {
      message: {
        text: "surf and isolation",
        chat: { id: 321 },
        message_id: 1,
        from: { id: 3, username: "nl_user", language_code: "en" }
      }
    }
  }, res);

  const body = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string);
  expect(body.execution_context.command).toBeNull();
  expect(body.execution_context.user_context.activity_types).toEqual([]);
});
