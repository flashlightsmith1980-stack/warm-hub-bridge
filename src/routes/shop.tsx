import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Package, Sparkles } from "lucide-react";
import { shopCatalog } from "@/lib/storefront.functions";
import { Button } from "@/components/ui/button";
import { SiteHeader, ChannelStrip } from "@/components/site-header";

const catalogQuery = queryOptions({ queryKey: ["shop-catalog"], queryFn: () => shopCatalog() });

const DESCRIPTION =
  "Browse every product in stock — accounts, keys and files, with live stock counts and instant delivery after checkout.";

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>) => ({
    category: search["category"] ? Number(search["category"]) : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  head: () => ({
    meta: [
      { title: "Shop all products — Enroll Log" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Shop all products — Enroll Log" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <main className="p-10 text-center text-muted-foreground">
      The catalog is unavailable right now. Please refresh in a moment.
    </main>
  ),
  notFoundComponent: () => <main className="p-10 text-center">Page not found.</main>,
  component: Shop,
});

function Shop() {
  const { data } = useSuspenseQuery(catalogQuery);
  const { category } = Route.useSearch();
  const products = category
    ? data.products.filter((product) => product.category_id === category)
    : data.products;

  return (
    <div className="min-h-screen">
      <ChannelStrip />
      <SiteHeader storeName="Enroll Log" />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold">All products</h1>
        <p className="mt-1 text-sm text-muted-foreground">{DESCRIPTION}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild size="sm" variant={category ? "outline" : "default"}>
            <Link to="/shop">All</Link>
          </Button>
          {data.categories.map((item) => (
            <Button
              key={item.id}
              asChild
              size="sm"
              variant={category === item.id ? "default" : "outline"}
            >
              <Link to="/shop" search={{ category: item.id }}>
                {item.name}
              </Link>
            </Button>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <article key={product.id} className="panel flex flex-col overflow-hidden">
              <div className="vault-gradient aspect-[16/9] overflow-hidden">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <Package className="size-8 text-primary/70" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold">{product.name}</h2>
                  {product.is_featured && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                      <Sparkles className="size-3" /> Featured
                    </span>
                  )}
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {product.description ?? "Instant delivery after checkout."}
                </p>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="font-display text-xl">${product.price.toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground">
                    {product.unlimited ? "Unlimited" : `${product.stock} in stock`}
                  </span>
                </div>
                <Button asChild size="sm" disabled={!product.unlimited && product.stock === 0}>
                  <a href="https://t.me/Enroll_Logsbot" target="_blank" rel="noreferrer">
                    {!product.unlimited && product.stock === 0 ? "Out of stock" : "Buy now"}
                  </a>
                </Button>
              </div>
            </article>
          ))}
          {!products.length && (
            <p className="text-sm text-muted-foreground">Nothing listed in this category yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
