type Req = {
  body?: {
    message?: { text?: string };
    text?: string;
  };
};

type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => unknown;
};

export default async function handler(req: Req, res: Res) {
  const text = req.body?.message?.text || req.body?.text || "";
  if (!text) {
    return res.status(200).json({ ok: true });
  }

  const fireUrl = process.env.ROUTINE_FIRE_URL;
  const token = process.env.ROUTINE_TOKEN;

  if (fireUrl && token) {
    void fetch(fireUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    }).catch(() => undefined);
  }

  return res.status(200).json({ ok: true });
}
