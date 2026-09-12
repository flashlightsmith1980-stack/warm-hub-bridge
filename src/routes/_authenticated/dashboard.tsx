import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Lock, Wallet, Receipt, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accountOverview, linkTelegramAccount } from "@/lib/storefront.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — your account" },
      {
        name: "description",
        content: "Your balance, purchases, delivered keys and deposit history in one place.",
      },
      { property: "og:title", content: "Dashboard — your account" },
      {
        property: "og:description",
        content: "Your balance, purchases, delivered keys and deposit history in one place.",
      },
    ],
  }),
  component: CustomerDashboard,
});

const money = (value: number) => `$${Number(value ?? 0).toFixed(2)}`;

function CustomerDashboard() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const load = useServerFn(accountOverview);
  const link = useServerFn(linkTelegramAccount);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ["account-overview"], queryFn: () => load({}) });

  async function connect() {
    setBusy(true);
    try {
      const result = await link({ data: { handle } });
      toast.success(result.message);
      await client.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect that account");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await client.cancelQueries();
    client.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const data = query.data;
  const account = data?.account;

  return (
    <div className="min-h-screen">
      <SiteHeader storeName="Enroll Log" />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Your account</p>
            <h1 className="font-display mt-1 text-3xl font-bold">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Balance, purchases and deposits — synced with your Telegram store account.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/shop">Browse products</Link>
            </Button>
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </header>

        {query.isLoading && <p className="text-sm text-muted-foreground">Loading your account…</p>}

        {data && !data.linked && (
          <section className="panel flex flex-col gap-3 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Link2 className="size-4 text-primary" /> Connect your Telegram account
            </h2>
            <p className="text-sm text-muted-foreground">
              Already shopping with the bot or Mini App? Enter your Telegram @username or numeric ID
              once and your balance, purchases and deposits appear here.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-xs"
                placeholder="@username or 123456789"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
              />
              <Button disabled={busy || handle.trim().length < 2} onClick={connect}>
                Connect
              </Button>
            </div>
          </section>
        )}

        {account && (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Tile icon={Wallet} label="Balance" value={money(account.balance)} />
              <Tile icon={Lock} label="Locked bonus" value={money(account.locked)} />
              <Tile
                icon={Receipt}
                label="Spendable"
                value={money(Math.max(0, account.balance - account.locked))}
              />
            </section>

            <section className="panel p-5">
              <h2 className="text-lg font-semibold">Profile</h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <Row label="Telegram ID" value={String(account.telegram_id)} />
                <Row label="Username" value={account.username ? `@${account.username}` : "—"} />
                <Row label="Name" value={account.first_name ?? "—"} />
              </dl>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Purchases</h2>
              {(data?.orders ?? []).map((order) => (
                <article key={order.id} className="panel flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">Order #{order.id}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{order.status}</Badge>
                      <Badge variant="secondary">{money(order.total)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-md border border-border bg-background/60 p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {item.name} × {item.quantity}
                          </span>
                          <span className="text-muted-foreground">{money(item.price)}</span>
                        </div>
                        {item.delivered_asset && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <code className="max-w-full flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                              {item.delivered_asset}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(item.delivered_asset ?? "");
                                toast.success("Copied");
                              }}
                            >
                              <Copy className="size-3.5" />
                            </Button>
                            {/^https?:\/\//.test(item.delivered_asset) && (
                              <Button asChild size="sm" variant="outline">
                                <a href={item.delivered_asset} target="_blank" rel="noreferrer">
                                  <Download className="size-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
              {!(data?.orders ?? []).length && (
                <p className="text-sm text-muted-foreground">No purchases yet.</p>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Deposits</h2>
              {(data?.deposits ?? []).map((deposit) => (
                <div
                  key={deposit.id}
                  className="panel flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <span className="font-mono text-xs">{deposit.code}</span>
                  <span className="text-muted-foreground">{deposit.asset}</span>
                  <span>{money(deposit.amount)}</span>
                  <Badge variant="outline">{deposit.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(deposit.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
              {!(data?.deposits ?? []).length && (
                <p className="text-sm text-muted-foreground">No deposits yet.</p>
              )}
            </section>
          </>
        )}

        {data?.isAdmin && (
          <p className="pt-6 text-center text-xs text-muted-foreground">
            <Link to="/ops-x7k2q9" className="hover:text-foreground">
              ·
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <div className="panel vault-gradient p-4">
      <Icon className="size-4 text-primary" />
      <p className="font-display mt-2 text-2xl font-bold">{value}</p>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
