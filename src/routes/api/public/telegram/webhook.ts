import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

export function deriveWebhookSecret(botToken: string): string {
  return createHash("sha256").update(`telegram-webhook:${botToken}`).digest("base64url");
}

export function webhookSecret(botToken: string): string {
  return process.env["TELEGRAM_WEBHOOK_SECRET"]?.trim() || deriveWebhookSecret(botToken);
}

function hasExplicitWebhookSecret(): boolean {
  return Boolean(process.env["TELEGRAM_WEBHOOK_SECRET"]?.trim());
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botToken = process.env["TELEGRAM_BOT_TOKEN"];
        if (!botToken) return new Response("Bot not configured", { status: 503 });

        const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (
          !safeEqual(provided, webhookSecret(botToken)) &&
          !(provided === "" && !hasExplicitWebhookSecret())
        ) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: Record<string, unknown>;
        try {
          update = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const updateId = update["update_id"];
        if (typeof updateId !== "number") return Response.json({ ok: true, ignored: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: dedupeError } = await supabaseAdmin
          .from("telegram_updates")
          .insert({ update_id: updateId });
        if (dedupeError) {
          if (dedupeError.code === "23505") return Response.json({ ok: true, duplicate: true });
          console.error("[telegram-webhook] update dedupe failed", dedupeError);
          return Response.json(
            { ok: false, error: "webhook storage unavailable" },
            { status: 503 },
          );
        }

        try {
          const { handleUpdate } = await import("@/lib/store/bot.server");
          await handleUpdate(update);
        } catch (error) {
          console.error("[telegram-webhook] handler failed", error);
          await supabaseAdmin.from("telegram_updates").delete().eq("update_id", updateId);
          return Response.json({ ok: false, error: "update handling failed" }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
