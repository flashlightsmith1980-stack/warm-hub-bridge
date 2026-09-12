import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ShoppingCart, Send, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accountOverview } from "@/lib/storefront.functions";
import { Button } from "@/components/ui/button";

const CHANNEL = "https://t.me/ebankenroll";

export function useSession() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return signedIn;
}

export function SiteHeader({ storeName }: { storeName: string }) {
  const signedIn = useSession();
  const load = useServerFn(accountOverview);
  const account = useQuery({
    queryKey: ["account-overview-header"],
    queryFn: () => load({}),
    enabled: signedIn === true,
  });
  const balance = account.data?.account?.balance ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="font-display text-lg font-bold tracking-tight">
          {storeName}
        </Link>
        <nav className="ml-4 hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
          <Link to="/shop" className="hover:text-foreground">
            Products
          </Link>
          <a href={CHANNEL} target="_blank" rel="noreferrer" className="hover:text-foreground">
            Telegram
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground">
                <Wallet className="size-3.5 text-primary" /> ${balance.toFixed(2)}
              </span>
              <Button asChild size="sm" variant="secondary">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm" variant="secondary">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline" aria-label="Cart">
            <Link to="/shop">
              <ShoppingCart className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function ChannelStrip() {
  return (
    <a
      href={CHANNEL}
      target="_blank"
      rel="noreferrer"
      className="block border-b border-border bg-primary/10 px-4 py-2 text-center text-xs text-foreground hover:bg-primary/15"
    >
      <Send className="mr-1.5 inline size-3.5 text-primary" />
      Join our Telegram channel for daily drops and restock alerts — @ebankenroll
    </a>
  );
}
