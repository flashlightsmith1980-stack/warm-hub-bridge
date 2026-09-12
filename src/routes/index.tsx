import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Boxes,
  CheckCircle2,
  Layers,
  MessagesSquare,
  Package,
  ShieldCheck,
  ShoppingBag,
  Star,
  Timer,
  Truck,
} from "lucide-react";
import { storefrontData } from "@/lib/storefront.functions";
import { Button } from "@/components/ui/button";
import { SiteHeader, ChannelStrip } from "@/components/site-header";

const storefrontQuery = queryOptions({
  queryKey: ["storefront"],
  queryFn: () => storefrontData(),
});

const DESCRIPTION =
  "Buy verified digital products instantly — browse the catalog, top up your balance and get your keys and files delivered the moment payment clears.";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(storefrontQuery),
  head: () => ({
    meta: [
      { title: "Enroll Log — Instant digital goods store" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Enroll Log — Instant digital goods store" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <main className="p-10 text-center text-muted-foreground">
      The storefront is unavailable right now. Please refresh in a moment.
    </main>
  ),
  notFoundComponent: () => <main className="p-10 text-center">Page not found.</main>,
  component: Index,
});

const WHY = [
  { icon: Timer, title: "Instant delivery", body: "Keys and files land in your account seconds after checkout." },
  { icon: ShieldCheck, title: "Verified stock", body: "Every item is checked before it is listed for sale." },
  { icon: Truck, title: "Always restocked", body: "New inventory added daily across every category." },
  { icon: MessagesSquare, title: "Real support", body: "Talk to a human on Telegram whenever you need help." },
  { icon: CheckCircle2, title: "Replacement policy", body: "Something wrong? Open a dispute and get it sorted." },
  { icon: ShoppingBag, title: "Buy your way", body: "Use the website, the Telegram bot or the Mini App." },
];

function Index() {
  const { data } = useSuspenseQuery(storefrontQuery);
  const tiles = [
    { icon: Package, label: "Products", value: data.stats.products },
    { icon: Boxes, label: "In stock", value: data.stats.inStock },
    { icon: Layers, label: "Categories", value: data.stats.categories },
    { icon: ShoppingBag, label: "Orders", value: data.stats.orders },
    { icon: Star, label: "Reviews", value: data.stats.reviews },
    { icon: Timer, label: "Support", value: "24/7" },
  ];

  return (
    <div className="min-h-screen">
      <ChannelStrip />
      <SiteHeader storeName={data.store.name} />

      <main className="mx-auto max-w-6xl px-4 pb-20">
        <section className="py-14 text-center sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" /> Trusted digital marketplace
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-tight font-bold text-balance sm:text-6xl">
            Premium digital products, delivered <span className="text-primary">instantly</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{DESCRIPTION}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/shop">Browse products</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="https://t.me/ebankenroll" target="_blank" rel="noreferrer">
                Join Telegram
              </a>
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((tile) => (
            <div key={tile.label} className="panel vault-gradient p-4 text-center">
              <tile.icon className="mx-auto size-5 text-primary" />
              <p className="font-display mt-2 text-2xl font-bold">{tile.value}</p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {tile.label}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold">Shop by category</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.categories.length} categories, restocked daily.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.categories.map((category) => (
              <article key={category.id} className="panel overflow-hidden">
                <div className="vault-gradient aspect-[16/9] w-full overflow-hidden">
                  {category.image_url ? (
                    <img
                      src={category.image_url}
                      alt={`${category.name} category`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <Layers className="size-8 text-primary/70" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3 p-4">
                  <h3 className="text-lg font-semibold">{category.name}</h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {category.description ?? "Verified items ready for instant delivery."}
                  </p>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">
                      {category.products} products
                    </span>
                    <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">
                      {category.stock} in stock
                    </span>
                  </div>
                  <Button asChild size="sm" className="mt-1 w-full">
                    <Link to="/shop" search={{ category: category.id }}>
                      View products
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
            {!data.categories.length && (
              <p className="text-sm text-muted-foreground">Categories are being set up.</p>
            )}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold">Why shop with us</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHY.map((item) => (
              <div key={item.title} className="panel p-5">
                <item.icon className="size-5 text-primary" />
                <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold">What customers say</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.reviews.map((review) => (
              <article key={review.id} className="panel flex flex-col gap-3 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 font-display text-sm text-primary">
                    {review.initials}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{review.author}</p>
                    <p className="text-xs text-muted-foreground">
                      {review.product_label ?? "Verified buyer"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: review.rating }).map((_, index) => (
                    <Star key={index} className="size-4 fill-accent text-accent" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">{review.body}</p>
              </article>
            ))}
            {!data.reviews.length && (
              <p className="text-sm text-muted-foreground">No reviews published yet.</p>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>
          {data.store.name} · Website, Telegram bot and Mini App ·{" "}
          <a
            className="hover:text-foreground"
            href="https://t.me/ebankenroll"
            target="_blank"
            rel="noreferrer"
          >
            @ebankenroll
          </a>
        </p>
      </footer>
    </div>
  );
}
