/** Thin Telegram Bot API wrapper (server-only). */

export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
};
export type InlineKeyboard = InlineButton[][];

function token(): string {
  const t = process.env["TELEGRAM_BOT_TOKEN"];
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return t;
}

export async function tg<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!res.ok || !body.ok) {
    throw new Error(`Telegram ${method} failed [${res.status}]: ${body.description ?? "unknown"}`);
  }
  return body.result as T;
}

export async function tgSafe(method: string, payload: Record<string, unknown> = {}) {
  try {
    return await tg(method, payload);
  } catch (error) {
    console.error("[telegram]", method, error);
    return null;
  }
}

export function keyboard(rows: InlineKeyboard) {
  return { inline_keyboard: rows };
}

export async function sendMessage(
  chatId: number,
  text: string,
  markup?: InlineKeyboard,
  extra: Record<string, unknown> = {},
) {
  return tgSafe("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(markup ? { reply_markup: keyboard(markup) } : {}),
    ...extra,
  });
}

export async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  markup?: InlineKeyboard,
) {
  const result = await tgSafe("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(markup ? { reply_markup: keyboard(markup) } : {}),
  });
  if (result === null) await sendMessage(chatId, text, markup);
  return result;
}

export async function answerCallback(id: string, text?: string, alert = false) {
  return tgSafe("answerCallbackQuery", {
    callback_query_id: id,
    ...(text ? { text, show_alert: alert } : {}),
  });
}

export async function getChatMember(chatId: string | number, userId: number) {
  const result = await tgSafe("getChatMember", { chat_id: chatId, user_id: userId });
  return result as {
    status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
    is_member?: boolean;
  } | null;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function caption(text: string): string {
  return text.length > 1000 ? `${text.slice(0, 997)}…` : text;
}

export async function deleteMessage(chatId: number, messageId: number) {
  return tgSafe("deleteMessage", { chat_id: chatId, message_id: messageId });
}

/** Sends a banner-style card: photo + caption + buttons, or plain text when no image. */
export async function sendCard(
  chatId: number,
  photo: string | null | undefined,
  text: string,
  markup?: InlineKeyboard,
) {
  if (!photo) return sendMessage(chatId, text, markup);
  const sent = await tgSafe("sendPhoto", {
    chat_id: chatId,
    photo,
    caption: caption(text),
    parse_mode: "HTML",
    ...(markup ? { reply_markup: keyboard(markup) } : {}),
  });
  if (sent === null) return sendMessage(chatId, text, markup);
  return sent;
}

/**
 * Updates an existing message into a banner card. Telegram cannot convert a text
 * message into a photo message, so we replace it when the in-place edit fails.
 */
export async function editCard(
  chatId: number,
  messageId: number,
  photo: string | null | undefined,
  text: string,
  markup?: InlineKeyboard,
) {
  if (!photo) {
    const edited = await tgSafe("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(markup ? { reply_markup: keyboard(markup) } : {}),
    });
    if (edited !== null) return edited;
    await deleteMessage(chatId, messageId);
    return sendMessage(chatId, text, markup);
  }

  const edited = await tgSafe("editMessageMedia", {
    chat_id: chatId,
    message_id: messageId,
    media: { type: "photo", media: photo, caption: caption(text), parse_mode: "HTML" },
    ...(markup ? { reply_markup: keyboard(markup) } : {}),
  });
  if (edited !== null) return edited;
  await deleteMessage(chatId, messageId);
  return sendCard(chatId, photo, text, markup);
}

/** Uploads an in-memory text file to a chat (used for order delivery receipts). */
export async function sendDocument(
  chatId: number,
  fileName: string,
  content: string,
  caption?: string,
  markup?: InlineKeyboard,
): Promise<unknown | null> {
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append(
      "document",
      new Blob([content], { type: "text/plain; charset=utf-8" }),
      fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60),
    );
    if (caption) {
      form.append("caption", caption.length > 1000 ? `${caption.slice(0, 997)}…` : caption);
      form.append("parse_mode", "HTML");
    }
    if (markup) form.append("reply_markup", JSON.stringify(keyboard(markup)));

    const res = await fetch(`https://api.telegram.org/bot${token()}/sendDocument`, {
      method: "POST",
      body: form,
    });
    const body = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
    if (!res.ok || !body.ok) throw new Error(body.description ?? `HTTP ${res.status}`);
    return body.result ?? null;
  } catch (error) {
    console.error("[telegram] sendDocument", error);
    return null;
  }
}

/** Sends a remote product file through Telegram without exposing bot credentials. */
export async function sendDocumentUrl(
  chatId: number,
  documentUrl: string,
  caption?: string,
  markup?: InlineKeyboard,
): Promise<unknown | null> {
  return tgSafe("sendDocument", {
    chat_id: chatId,
    document: documentUrl,
    ...(caption
      ? {
          caption: caption.length > 1000 ? `${caption.slice(0, 997)}…` : caption,
          parse_mode: "HTML",
        }
      : {}),
    ...(markup ? { reply_markup: keyboard(markup) } : {}),
  });
}
