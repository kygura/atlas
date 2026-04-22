type PhotoSize = {
  file_id: string;
  width: number;
  height: number;
};

type TelegramChat = {
  id?: number | string;
};

type TelegramUser = {
  id?: number;
  username?: string;
  language_code?: string;
};

type TelegramLocation = {
  latitude: number;
  longitude: number;
};

type Req = {
  body?: {
    message?: {
      chat?: TelegramChat;
      from?: TelegramUser;
      message_id?: number;
      text?: string;
      caption?: string;
      photo?: PhotoSize[];
      location?: TelegramLocation;
    };
    text?: string;
    photo_file_id?: string;
    chat_id?: string | number;
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
  const chatId = message?.chat?.id != null ? String(message.chat.id) : req.body?.chat_id != null ? String(req.body.chat_id) : null;

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
    const body: Record<string, unknown> = payload;
    body.execution_context = {
      trigger_source: "telegram",
      origin_interface: "telegram",
      request_text: text || null,
      defaulted_params: [],
      context_summary: [],
      resolved_origin: null,
      user_context: {
        location_label: null,
        preferred_origins: [],
        max_budget_eur: null,
        destination_focus: [],
        preference_tags: [],
        notes: []
      },
      telegram: chatId ? {
        chat_id: chatId,
        message_id: message?.message_id ?? null,
        user_id: message?.from?.id ?? null,
        username: message?.from?.username ?? null,
        language_code: message?.from?.language_code ?? null,
        photo_file_id: photoFileId ?? null,
        location: message?.location
          ? {
              latitude: message.location.latitude,
              longitude: message.location.longitude
            }
          : null
      } : null
    };
    void fetch(fireUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }).catch(() => undefined);
  }

  return res.status(200).json({ ok: true });
}
