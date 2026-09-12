import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;
let telegramWebhookPromise: Promise<void> | undefined;

async function ensureTelegramWebhook(): Promise<void> {
  if (telegramWebhookPromise) return telegramWebhookPromise;
  const botToken = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  const siteUrl = (
    process.env["PUBLIC_SITE_URL"]?.trim() ||
    process.env["VITE_SITE_URL"]?.trim() ||
    "https://enrollmentlog.lovable.app"
  ).replace(/\/$/, "");
  if (!botToken || !siteUrl) return;
  telegramWebhookPromise = (async () => {
    try {
      const { tg } = await import("./lib/store/telegram.server");
      const { webhookSecret } = await import("./routes/api/public/telegram/webhook");
      await tg("setWebhook", {
        url: `${siteUrl}/api/public/telegram/webhook`,
        secret_token: webhookSecret(botToken),
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      });
      console.info("[telegram] webhook configured", `${siteUrl}/api/public/telegram/webhook`);
    } catch (error) {
      console.error("[telegram] webhook auto-configuration failed", error);
    }
  })();
  return telegramWebhookPromise;
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      void ensureTelegramWebhook();
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
