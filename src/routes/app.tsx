import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Copy,
  Loader2,
  Mail,
  Package,
  Send,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import {
  miniappAddToCart,
  miniappBootstrap,
  miniappCheckout,
  miniappLogin,
  miniappLogout,
  miniappMarkNoteRead,
  miniappRemoveFromCart,
  miniappSubmitHash,
  miniappTopUp,
} from "@/lib/store/miniapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  initData?: string;
};

const CHANNEL = "https://t.me/ebankenroll";
const TOKEN_KEY = "miniapp_session_token";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Store App — Enroll Log" },
      {
        name: "description",
        content:
          "Sign in with your username and password to browse the catalog, top up with crypto and buy digital goods instantly.",
      },
      { property: "og:title", content: "Store App — Enroll Log" },
      {
        property: "og:description",
        content: "Browse the catalog, top up with BTC, USDT or USDC and buy instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  component: MiniApp,
  ssr: false,
});

type Boot = Awaited<ReturnType<typeof miniappBootstrap>>;
type Invoice = Awaited<ReturnType<typeof miniappTopUp>>;
type Tab = "shop" | "cart" | "wallet" | "orders" | "notes";
type Auth = { initData: string | null; token: string | null };

const ASSETS = [
  { id: "BTC", label: "Bitcoin (BTC)" },
  { id: "USDT_TRC20", label: "USDT · TRC20" },
  { id: "USDC_ERC20", label: "USDC · Ethereum" },
] as const;

function usd(value: number) {
  return `$${Number(value).toFixed(2)}`;
}

function Banner({
  image,
  title,
  subtitle,
}: {
  image?: string | null;
  title: string;
  subtitle?: string | null;
}) {
  return (
    <div className="panel relative overflow-hidden">
      {image ? (
        <img src={image} alt={title} loading="lazy" className="h-36 w-full object-cover" />
      ) : (
        <div className="vault-gradient h-24 w-full" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-3">
        <p className="font-display text-base font-bold">{title}</p>
        {subtitle ? <p className="line-clamp-2 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function LoginScreen({
  onSignedIn,
  message,
}: {
  onSignedIn: (token: string) => void;
  message?: string | null;
}) {
  const login = useServerFn(miniappLogin);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await login({ data: { username: username.trim(), password } });
      onSignedIn(result.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="panel vault-gradient w-full max-w-sm p-6">
        <h1 className="font-display text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the username and password the bot sent you after you pressed Start.
        </p>
        <form
          className="mt-5 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            placeholder="Username"
            autoCapitalize="none"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={busy || !username.trim() || password.length < 4}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        {message ? <p className="mt-3 text-xs text-muted-foreground">{message}</p> : null}
        <a
          href={CHANNEL}
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex items-center justify-center gap-1.5 rounded-md border border-border bg-primary/10 px-3 py-2 text-xs hover:bg-primary/15"
        >
          <Send className="size-3.5 text-primary" /> No account yet? Press Start in our Telegram bot
        </a>
      </div>
    </main>
  );
}

function MiniApp() {
  const bootstrap = useServerFn(miniappBootstrap);
  const addToCartFn = useServerFn(miniappAddToCart);
  const removeFn = useServerFn(miniappRemoveFromCart);
  const checkoutFn = useServerFn(miniappCheckout);
  const topUpFn = useServerFn(miniappTopUp);
  const submitHashFn = useServerFn(miniappSubmitHash);
  const markReadFn = useServerFn(miniappMarkNoteRead);
  const logoutFn = useServerFn(miniappLogout);

  const [auth, setAuth] = useState<Auth | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [data, setData] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("shop");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [asset, setAsset] = useState<(typeof ASSETS)[number]["id"]>("BTC");
  const [amount, setAmount] = useState("20");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [hash, setHash] = useState("");

  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
    const initData = tg?.initData;
    if (initData) {
      setAuth({ initData, token: null });
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      setAuth({ initData: null, token });
      return;
    }
    setNeedsLogin(true);
  }, []);

  const refresh = useCallback(
    async (value: Auth) => {
      try {
        setData(await bootstrap({ data: value }));
        setError(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load the store";
        if (value.token && /sign in|expired|not found/i.test(message)) {
          localStorage.removeItem(TOKEN_KEY);
          setAuth(null);
          setNeedsLogin(true);
          setLoginMessage(message);
          return;
        }
        setError(message);
      }
    },
    [bootstrap],
  );

  useEffect(() => {
    if (auth) void refresh(auth);
  }, [auth, refresh]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, []);

  const visibleProducts = useMemo(() => {
    if (!data) return [];
    if (subcategoryId) return data.products.filter((p) => p.subcategory_id === subcategoryId);
    if (categoryId)
      return data.products.filter((p) => p.category_id === categoryId && !p.subcategory_id);
    return data.products;
  }, [data, categoryId, subcategoryId]);

  const unreadNotes = data?.notes.filter((note) => !note.read_at).length ?? 0;

  if (needsLogin) {
    return (
      <LoginScreen
        message={loginMessage}
        onSignedIn={(token) => {
          localStorage.setItem(TOKEN_KEY, token);
          setNeedsLogin(false);
          setLoginMessage(null);
          setAuth({ initData: null, token });
        }}
      />
    );
  }

  if (error && !data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="font-display text-lg font-bold">Store app</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
      </main>
    );
  }

  if (!data || !auth) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  const productCard = (product: Boot["products"][number]) => (
    <article key={product.id} className="panel overflow-hidden">
      {product.image_url ? (
        <img
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          className="h-40 w-full object-cover"
        />
      ) : null}
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display font-bold">{product.name}</p>
          <span className="shrink-0 font-mono font-semibold text-primary">
            {usd(product.price)}
          </span>
        </div>
        {product.description ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">{product.description}</p>
        ) : null}
        <p className="font-mono text-xs text-muted-foreground">
          {product.stock === null
            ? "Unlimited availability"
            : product.stock > 0
              ? `${product.stock} in stock`
              : "Out of stock"}
        </p>
        <Button
          disabled={busy || !product.in_stock}
          onClick={() =>
            run(async () => {
              await addToCartFn({ data: { ...auth, productId: product.id } });
              await refresh(auth);
              setNotice(`${product.name} added to your cart.`);
            })
          }
        >
          {product.in_stock ? "Add to cart" : "Out of stock"}
        </Button>
      </div>
    </article>
  );

  const category = data.categories.find((c) => c.id === categoryId) ?? null;
  const subcategory = category?.subcategories.find((s) => s.id === subcategoryId) ?? null;
  const productCount = data.products.length;
  const availableCount = data.products.filter((p) => p.in_stock).length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="font-display text-lg font-bold tracking-tight">{data.store.name}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-xs">
            <Wallet className="size-3.5 text-primary" /> {usd(data.user.balance)}
          </span>
          {auth.token ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                run(async () => {
                  await logoutFn({ data: { token: auth.token! } });
                  localStorage.removeItem(TOKEN_KEY);
                  setData(null);
                  setAuth(null);
                  setNeedsLogin(true);
                })
              }
            >
              Sign out
            </Button>
          ) : null}
        </div>
      </header>

      <a
        href={CHANNEL}
        target="_blank"
        rel="noreferrer"
        className="block border-b border-border bg-primary/10 px-4 py-2 text-center text-xs hover:bg-primary/15"
      >
        <Send className="mr-1.5 inline size-3.5 text-primary" />
        Join our Telegram channel for daily drops and restock alerts — @ebankenroll
      </a>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 pb-28">
        <section className="panel vault-gradient flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs text-muted-foreground">
              Welcome back{data.user.first_name ? `, ${data.user.first_name}` : ""}
            </p>
            <h1 className="font-display text-2xl font-bold">{data.store.name}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              @{data.user.login_username ?? "account"} · ID {data.user.id}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ["Products", String(productCount)],
              ["Available", String(availableCount)],
              ["Orders", String(data.orders.length)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-border bg-card/70 px-3 py-2">
                <p className="font-display text-lg font-bold text-primary">{value}</p>
                <p className="text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {notice ? <p className="panel p-3 text-sm">{notice}</p> : null}

        {tab === "shop" ? (
          <section className="flex flex-col gap-4">
            {subcategory ? (
              <>
                <button
                  className="flex items-center gap-1 text-sm text-muted-foreground"
                  onClick={() => setSubcategoryId(null)}
                >
                  <ArrowLeft className="size-4" /> {category?.name}
                </button>
                <Banner
                  image={subcategory.image_url}
                  title={subcategory.name}
                  subtitle={subcategory.description}
                />
              </>
            ) : category ? (
              <>
                <button
                  className="flex items-center gap-1 text-sm text-muted-foreground"
                  onClick={() => setCategoryId(null)}
                >
                  <ArrowLeft className="size-4" /> All categories
                </button>
                <Banner
                  image={category.image_url}
                  title={category.name}
                  subtitle={category.description}
                />
                {category.subcategories.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {category.subcategories.map((sub) => (
                      <button
                        key={sub.id}
                        className="text-left"
                        onClick={() => setSubcategoryId(sub.id)}
                      >
                        <Banner image={sub.image_url} title={sub.name} subtitle={sub.description} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <Banner
                  image={data.store.banner}
                  title={data.store.name}
                  subtitle={data.store.welcome}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.categories.map((c) => {
                    const count = data.products.filter((p) => p.category_id === c.id).length;
                    return (
                      <button key={c.id} className="text-left" onClick={() => setCategoryId(c.id)}>
                        <Banner
                          image={c.image_url}
                          title={c.name}
                          subtitle={`${count} product${count === 1 ? "" : "s"}`}
                        />
                      </button>
                    );
                  })}
                </div>
                {data.featured.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <h2 className="font-display text-base font-bold">Featured</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {data.featured.map(productCard)}
                    </div>
                  </div>
                ) : null}
              </>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {visibleProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing here yet.</p>
              ) : null}
              {visibleProducts.map(productCard)}
            </div>
          </section>
        ) : null}

        {tab === "cart" ? (
          <section className="flex flex-col gap-3">
            {data.cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">Your cart is empty.</p>
            ) : null}
            {data.cart.map((row) => (
              <div key={row.id} className="panel flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">
                    {row.product.name} × {row.quantity}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {usd(row.product.price * row.quantity)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await removeFn({ data: { ...auth, cartItemId: row.id } });
                      await refresh(auth);
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            {data.cart.length > 0 ? (
              <>
                <p className="text-right font-mono text-sm font-semibold">
                  Total {usd(data.cartTotal)}
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await checkoutFn({ data: auth });
                      await refresh(auth);
                      setNotice(
                        result.ok
                          ? `Order #${result.orderId} completed — your items are in Orders.`
                          : result.reason,
                      );
                      if (result.ok) setTab("orders");
                    })
                  }
                >
                  Pay with balance
                </Button>
              </>
            ) : null}
          </section>
        ) : null}

        {tab === "wallet" ? (
          <section className="flex flex-col gap-3">
            <div className="panel p-4">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="font-display text-2xl font-bold">{usd(data.user.balance)}</p>
            </div>

            {invoice ? (
              <div className="panel flex flex-col gap-3 p-4">
                <p className="text-sm font-semibold">
                  Send exactly {invoice.amount} {invoice.assetLabel}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {invoice.network} · invoice {invoice.code} · {usd(invoice.amountUsd)}
                </p>
                <button
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-left font-mono text-xs break-all"
                  onClick={() => navigator.clipboard?.writeText(invoice.address)}
                >
                  {invoice.address}
                  <Copy className="size-4 shrink-0" />
                </button>
                <Input
                  placeholder="Transaction hash (TxID)"
                  value={hash}
                  onChange={(e) => setHash(e.target.value)}
                />
                <Button
                  disabled={busy || hash.trim().length < 6}
                  onClick={() =>
                    run(async () => {
                      const result = await submitHashFn({
                        data: { ...auth, txId: invoice.id, hash },
                      });
                      setNotice(result.message);
                      setHash("");
                      if (result.status === "credited") setInvoice(null);
                      await refresh(auth);
                    })
                  }
                >
                  Submit hash
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setInvoice(null)}>
                  New invoice
                </Button>
              </div>
            ) : (
              <div className="panel flex flex-col gap-3 p-4">
                <p className="text-sm font-semibold">Top up</p>
                <div className="grid grid-cols-3 gap-2">
                  {ASSETS.map((a) => (
                    <Button
                      key={a.id}
                      variant={asset === a.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAsset(a.id)}
                    >
                      {a.id.split("_")[0]}
                    </Button>
                  ))}
                </div>
                <Input
                  inputMode="decimal"
                  placeholder={`Amount in USD (min ${usd(data.store.min_topup)})`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const created = await topUpFn({
                        data: { ...auth, asset, amountUsd: Number(amount) },
                      });
                      setInvoice(created);
                    })
                  }
                >
                  Create invoice
                </Button>
              </div>
            )}
          </section>
        ) : null}

        {tab === "orders" ? (
          <section className="flex flex-col gap-3">
            {data.orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : null}
            {data.orders.map((order) => (
              <div key={order.id} className="panel p-4 text-sm">
                <p className="font-display font-bold">Order #{order.id}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {usd(Number(order.total_amount))} · {order.status} ·{" "}
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
                {order.order_items?.map((item) => (
                  <div
                    key={`${order.id}-${item.product_name}`}
                    className="mt-2 border-t border-border pt-2"
                  >
                    <p>
                      {item.product_name} x {item.quantity}
                    </p>
                    {item.delivered_asset ? (
                      <p className="font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
                        {item.delivered_asset}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </section>
        ) : null}

        {tab === "notes" ? (
          <section className="flex flex-col gap-3">
            {data.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages from the team yet.</p>
            ) : null}
            {data.notes.map((note) => (
              <article
                key={note.id}
                className={`panel p-4 ${note.read_at ? "" : "border-primary/50"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-display font-bold">{note.subject || "Message from support"}</p>
                  {!note.read_at ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                      New
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{note.body}</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {new Date(note.created_at).toLocaleString()}
                </p>
                {!note.read_at ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await markReadFn({ data: { ...auth, noteId: note.id } });
                        await refresh(auth);
                      })
                    }
                  >
                    Mark as read
                  </Button>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-3xl items-center justify-around border-t border-border bg-background/95 p-2 backdrop-blur">
        {(
          [
            ["shop", "Shop", Package],
            ["cart", `Cart${data.cart.length ? ` (${data.cart.length})` : ""}`, ShoppingCart],
            ["wallet", "Wallet", Wallet],
            ["orders", "Orders", Package],
            ["notes", `Inbox${unreadNotes ? ` (${unreadNotes})` : ""}`, Mail],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            className={`flex flex-col items-center gap-1 rounded-md px-3 py-2 text-[11px] font-medium ${tab === id ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            onClick={() => setTab(id as Tab)}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
