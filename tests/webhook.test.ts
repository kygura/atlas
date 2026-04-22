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
});

test("handler forwards message text and returns ok", async () => {
  process.env.ROUTINE_FIRE_URL = "https://example.com/fire";
  process.env.ROUTINE_TOKEN = "secret";

  const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const res = makeRes();
  await handler({ body: { message: { text: "surf and isolation" } } }, res);

  expect(res.statusCode).toBe(200);
  expect(res.payload).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string);
  expect(body.text).toBe("surf and isolation");
  expect(body.photo_file_id).toBeUndefined();
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
