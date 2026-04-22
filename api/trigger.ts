type PhotoSize = {
  file_id: string;
  width: number;
  height: number;
};

type Req = {
  body?: {
    message?: {
      text?: string;
      caption?: string;
      photo?: PhotoSize[];
    };
    text?: string;
    photo_file_id?: string;
  };
};

type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => unknown;
};

export default async function handler(req: Req, res: Res) {
  const message = req.body?.message;
  const text = message?.caption || message?.text || req.body?.text || "";
  const photos = message?.photo;
  const photoFileId = photos?.length ? photos[photos.length - 1]?.file_id : req.body?.photo_file_id;

  if (!text && !photoFileId) {
    return res.status(200).json({ ok: true });
  }

  const fireUrl = process.env.ROUTINE_FIRE_URL;
  const token = process.env.ROUTINE_TOKEN;

  if (fireUrl && token) {
    const payload: Record<string, string> = { text };
    if (photoFileId) {
      payload.photo_file_id = photoFileId;
    }
    void fetch(fireUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }).catch(() => undefined);
  }

  return res.status(200).json({ ok: true });
}
