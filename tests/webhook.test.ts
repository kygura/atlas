import { afterEach, expect, mock, test } from "bun:test";
import handler from "../api/trigger";

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

  let statusCode = 0;
  let payload: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return body;
    }
  };

  await handler({ body: { message: { text: "surf and isolation" } } }, res);
  expect(statusCode).toBe(200);
  expect(payload).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
