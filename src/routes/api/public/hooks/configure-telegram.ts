import { createFileRoute } from "@tanstack/react-router";
import { webhookSecret } from "@/routes/api/public/telegram/webhook";

function authorized(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const provided =
    bearer || request.headers.get("x-cron-secret") || request.headers.get("apikey") || "";
  return Boolean(process.env["CRON_SECRET"] && provided === process.env["CRON_SECRET"]);
}

export const Route = createFileRoute("/api/public/hooks/configure-telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const botToken = process.env["TELEGRAM_BOT_TOKEN"];
        const siteUrl = (
          process.env["PUBLIC_SITE_URL"]?.trim() ||
          process.env["VITE_SITE_URL"]?.trim() ||
          "https://enrollmentlog.lovable.app"
        ).replace(/\/$/, "");
        if (!botToken || !siteUrl) {
          return Response.json(
            { ok: false, error: "TELEGRAM_BOT_TOKEN is required" },
            { status: 503 },
          );
        }
        try {
          const { tg } = await import("@/lib/store/telegram.server");
          const url = `${siteUrl}/api/public/telegram/webhook`;
          await tg("setWebhook", {
            url,
            secret_token: webhookSecret(botToken),
            allowed_updates: ["message", "callback_query"],
            drop_pending_updates: false,
          });
          const info = await tg<{
            url: string;
            has_custom_certificate: boolean;
            pending_update_count: number;
            last_error_message?: string;
          }>("getWebhookInfo");
          return Response.json({ ok: true, configured_url: url, webhook: info });
        } catch (error) {
          console.error("[configure-telegram]", error);
          return Response.json(
            { ok: false, error: "Telegram webhook configuration failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
