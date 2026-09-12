import { createFileRoute } from "@tanstack/react-router";

function authorized(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const provided =
    bearer || request.headers.get("x-cron-secret") || request.headers.get("apikey") || "";
  return [process.env["CRON_SECRET"], process.env["SUPABASE_PUBLISHABLE_KEY"]].some(
    (value) => value && value === provided,
  );
}

export const Route = createFileRoute("/api/public/hooks/daily-promo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        try {
          const { sendDailyPromo } = await import("@/lib/store/bot.server");
          return Response.json({ ok: true, ...(await sendDailyPromo()) });
        } catch (error) {
          console.error("[daily-promo]", error);
          return Response.json({ ok: false, error: "promo failed" }, { status: 500 });
        }
      },
    },
  },
});
