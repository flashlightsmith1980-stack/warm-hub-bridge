import { createFileRoute } from "@tanstack/react-router";

/** Scheduled sweep: re-checks submitted crypto payments and expires stale invoices. */
export const Route = createFileRoute("/api/public/hooks/verify-payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        const provided =
          bearer || request.headers.get("x-cron-secret") || request.headers.get("apikey") || "";
        const accepted = [
          process.env["CRON_SECRET"],
          process.env["SUPABASE_PUBLISHABLE_KEY"],
        ].filter((value): value is string => Boolean(value));
        if (accepted.length === 0 || !accepted.includes(provided)) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const [{ sweepPendingPayments }, { sweepUndeliveredOrders }] = await Promise.all([
            import("@/lib/store/bot.server"),
            import("@/lib/store/fulfillment.server"),
          ]);
          const [payments, deliveries] = await Promise.all([
            sweepPendingPayments(),
            sweepUndeliveredOrders(),
          ]);
          return Response.json({ ok: true, ...payments, ...deliveries });
        } catch (error) {
          console.error("[verify-payments]", error);
          return Response.json({ ok: false, error: "sweep failed" }, { status: 500 });
        }
      },
    },
  },
});
