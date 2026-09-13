import { Link } from "@tanstack/react-router";
import {
  Layers,
  Package,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Timer,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, stockLabel } from "@/lib/utils";

export type ChromeCategory = {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  products: number;
  stock: number;
  fileProducts?: number;
};

export type ChromeProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock: number;
  unlimited: boolean;
  is_featured?: boolean;
};

export function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string | number;
}) {
  return (
    <div className="panel vault-gradient p-4 text-center">
      <Icon className="mx-auto size-5 text-primary" />
      <p className="font-display mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

export function CategoryCard({ category }: { category: ChromeCategory }) {
  const unlimited = (category.fileProducts ?? 0) > 0;
  return (
    <article className="panel overflow-hidden">
      <div className="vault-gradient aspect-video w-full overflow-hidden">
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
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-border px-2 py-1 tabular-nums text-muted-foreground">
            {category.products} {category.products === 1 ? "product" : "products"}
          </span>
          <span className="rounded-full border border-border px-2 py-1 tabular-nums text-muted-foreground">
            {category.stock === 0 && unlimited ? "Unlimited" : `${category.stock} available`}
          </span>
        </div>
        <Button asChild size="sm" className="mt-1 w-full">
          <Link to="/shop" search={{ category: category.id }}>
            View products
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function ProductCard({
  product,
  onAdd,
  busy,
  signedIn,
  buyHref,
}: {
  product: ChromeProduct;
  onAdd?: (product: ChromeProduct) => void;
  busy?: boolean;
  signedIn?: boolean;
  buyHref?: string;
}) {
  const available = product.unlimited || product.stock > 0;
  return (
    <article className="panel flex flex-col overflow-hidden">
      <div className="vault-gradient aspect-video overflow-hidden">
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
          {product.is_featured ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
              <Sparkles className="size-3" /> Featured
            </span>
          ) : null}
        </div>
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {product.description ?? "Instant delivery after checkout."}
        </p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-display text-xl tabular-nums">{money(product.price)}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {stockLabel(product.stock, product.unlimited)}
          </span>
        </div>
        {onAdd ? (
          <Button size="sm" disabled={busy || !available} onClick={() => onAdd(product)}>
            {!available ? "Out of stock" : signedIn ? "Add to cart" : "Sign in to buy"}
          </Button>
        ) : (
          <Button asChild size="sm" disabled={!available}>
            <a href={buyHref ?? "/app"} target={buyHref ? "_blank" : undefined} rel="noreferrer">
              {!available ? "Out of stock" : "Buy now"}
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}

export function WhyGrid() {
  const items = [
    {
      icon: Timer,
      title: "Instant delivery",
      body: "Keys and files land in your account seconds after checkout.",
    },
    {
      icon: ShieldCheck,
      title: "Verified stock",
      body: "Every item is checked before it is listed for sale.",
    },
    {
      icon: Truck,
      title: "Always restocked",
      body: "New inventory added daily across every category.",
    },
    { icon: Send, title: "Real support", body: "Talk to a human on Telegram whenever you need help." },
    {
      icon: ShoppingBag,
      title: "Buy your way",
      body: "Use the website, the Telegram bot or the Mini App.",
    },
    {
      icon: Wallet,
      title: "Crypto balance",
      body: "Top up with BTC, LTC, USDT or USDC and spend instantly.",
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className="panel p-5">
          <item.icon className="size-5 text-primary" />
          <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

export function StoreFooter({ name, channel = "ebankenroll" }: { name: string; channel?: string }) {
  return (
    <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
      <p>
        {name} · Website, Telegram bot and Mini App ·{" "}
        <a
          className="hover:text-foreground"
          href={`https://t.me/${channel}`}
          target="_blank"
          rel="noreferrer"
        >
          @{channel}
        </a>
      </p>
    </footer>
  );
}
