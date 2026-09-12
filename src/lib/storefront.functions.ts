/** Public storefront data + signed-in customer account portfolio. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StorefrontCategory = {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  products: number;
  stock: number;
};

export const storefrontData = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [categoriesRes, productsRes, keysRes, reviewsRes, settingsRes, ordersRes] =
    await Promise.all([
      supabaseAdmin.from("categories").select("*").order("sort_order").order("name"),
      supabaseAdmin
        .from("products")
        .select(
          "id,name,description,price,image_url,is_featured,product_type,category_id,is_active",
        )
        .eq("is_active", true),
      supabaseAdmin.from("product_keys").select("product_id").eq("is_sold", false).limit(50000),
      supabaseAdmin
        .from("store_reviews")
        .select("*")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(12),
      supabaseAdmin
        .from("store_settings")
        .select("store_name,channel_username,support_username,mini_app_url,banner_image_url")
        .eq("id", 1)
        .maybeSingle(),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
    ]);

  const products = productsRes.data ?? [];
  const keyCounts = new Map<number, number>();
  for (const row of keysRes.data ?? []) {
    keyCounts.set(row.product_id, (keyCounts.get(row.product_id) ?? 0) + 1);
  }
  const stockOf = (product: { id: number; product_type: string }) =>
    product.product_type === "file" ? 999 : (keyCounts.get(product.id) ?? 0);

  const categories: StorefrontCategory[] = (categoriesRes.data ?? []).map((category) => {
    const own = products.filter((product) => product.category_id === category.id);
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      image_url: category.image_url,
      products: own.length,
      stock: own.reduce((total, product) => total + stockOf(product), 0),
    };
  });

  const featured = products
    .filter((product) => product.is_featured)
    .slice(0, 6)
    .map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: Number(product.price),
      image_url: product.image_url,
      stock: stockOf(product),
    }));

  return {
    store: {
      name: settingsRes.data?.store_name ?? "Enroll Log",
      channel: settingsRes.data?.channel_username ?? "ebankenroll",
      support: settingsRes.data?.support_username ?? null,
      miniApp: settingsRes.data?.mini_app_url ?? null,
    },
    stats: {
      products: products.length,
      inStock: products.reduce((total, product) => total + stockOf(product), 0),
      categories: categories.length,
      orders: ordersRes.count ?? 0,
      reviews: reviewsRes.data?.length ?? 0,
    },
    categories,
    featured,
    reviews: (reviewsRes.data ?? []).map((review) => ({
      id: review.id,
      author: review.author,
      initials: review.initials,
      product_label: review.product_label,
      rating: review.rating,
      body: review.body,
    })),
  };
});

/** Portfolio for the signed-in website account, including any linked Telegram store account. */
export const accountOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: botUser }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("bot_users").select("*").eq("web_user_id", context.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId),
    ]);

    const isAdmin = (roles ?? []).some((row) => row.role === "admin");
    if (!botUser) {
      return { linked: false as const, isAdmin, account: null, orders: [], deposits: [] };
    }

    const [{ data: orders }, { data: deposits }] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id,status,total_amount,created_at,delivery_status,order_items(*)")
        .eq("user_id", botUser.id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("transactions")
        .select("id,invoice_code,asset,amount_usd,status,created_at")
        .eq("user_id", botUser.id)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const orderIds = (orders ?? []).map((order) => order.id);
    const { data: keys } = orderIds.length
      ? await supabaseAdmin
          .from("product_keys")
          .select("order_id,product_id,key_value")
          .in("order_id", orderIds)
      : { data: [] };

    return {
      linked: true as const,
      isAdmin,
      account: {
        telegram_id: Number(botUser.telegram_id),
        username: botUser.username,
        first_name: botUser.first_name,
        balance: Number(botUser.wallet_balance),
        locked: Number(botUser.locked_bonus ?? 0),
        joined: botUser.created_at,
      },
      orders: (orders ?? []).map((order) => ({
        id: order.id,
        status: order.status,
        delivery_status: order.delivery_status,
        total: Number(order.total_amount),
        created_at: order.created_at,
        items: (order.order_items ?? []).map((item) => ({
          id: item.id,
          name: item.product_name,
          quantity: item.quantity,
          price: Number(item.price),
          delivered_asset: item.delivered_asset,
        })),
        keys: (keys ?? []).filter((key) => key.order_id === order.id).map((key) => key.key_value),
      })),
      deposits: (deposits ?? []).map((deposit) => ({
        id: deposit.id,
        code: deposit.invoice_code,
        asset: deposit.asset,
        amount: Number(deposit.amount_usd),
        status: deposit.status,
        created_at: deposit.created_at,
      })),
    };
  });

/** Soft link used at sign-up: connects an existing store account when one matches. */
export const claimTelegramAccount = createServerFn({ method: "POST" })
  .validator((data) =>
    z
      .object({
        handle: z.string().trim().max(64).optional(),
        telegramId: z.string().trim().max(32).optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const handle = (data.handle ?? "").replace(/^@/, "").trim();
    const numeric = (data.telegramId ?? "").replace(/\D/g, "");
    if (!handle && !numeric) return { linked: false as const };

    const base = supabaseAdmin.from("bot_users").select("id,web_user_id");
    const { data: found } = numeric
      ? await base.eq("telegram_id", Number(numeric)).maybeSingle()
      : await base.ilike("username", handle).maybeSingle();

    if (!found) return { linked: false as const };
    if (found.web_user_id && found.web_user_id !== context.userId) {
      throw new Error("That Telegram account is already connected to another login.");
    }
    const { error } = await supabaseAdmin
      .from("bot_users")
      .update({ web_user_id: context.userId })
      .eq("id", found.id);
    if (error) throw new Error(error.message);
    return { linked: true as const };
  });

/** Links this website account to a Telegram store account by @username or numeric id. */
export const linkTelegramAccount = createServerFn({ method: "POST" })
  .validator((data) => z.object({ handle: z.string().trim().min(2).max(64) }).parse(data))

  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const handle = data.handle.replace(/^@/, "");
    const numeric = /^\d+$/.test(handle) ? Number(handle) : null;

    const query = supabaseAdmin.from("bot_users").select("id,web_user_id");
    const { data: found } = numeric
      ? await query.eq("telegram_id", numeric).maybeSingle()
      : await query.ilike("username", handle).maybeSingle();

    if (!found) {
      throw new Error("No store account found. Send /start to the bot first, then try again.");
    }
    if (found.web_user_id && found.web_user_id !== context.userId) {
      throw new Error("That store account is already linked to another website login.");
    }

    const { error } = await supabaseAdmin
      .from("bot_users")
      .update({ web_user_id: context.userId })
      .eq("id", found.id);
    if (error) throw new Error(error.message);
    return { message: "Telegram account linked." };
  });

/** Full public catalog for the website shop page. */
export const shopCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [categoriesRes, productsRes, keysRes] = await Promise.all([
    supabaseAdmin.from("categories").select("id,name,description,image_url").order("sort_order"),
    supabaseAdmin
      .from("products")
      .select("id,name,description,price,image_url,product_type,category_id,is_featured")
      .eq("is_active", true)
      .order("name"),
    supabaseAdmin.from("product_keys").select("product_id").eq("is_sold", false).limit(50000),
  ]);
  const counts = new Map<number, number>();
  for (const row of keysRes.data ?? []) counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1);
  return {
    categories: (categoriesRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      image_url: c.image_url,
    })),
    products: (productsRes.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      image_url: p.image_url,
      category_id: p.category_id,
      is_featured: p.is_featured,
      stock: p.product_type === "file" ? 999 : (counts.get(p.id) ?? 0),
      unlimited: p.product_type === "file",
    })),
  };
});
