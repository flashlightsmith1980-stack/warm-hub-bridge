/** Shared server-only data helpers for the Telegram store. */
import type { PaymentAsset } from "./rates.server";

export type StoreSettings = {
  id: number;
  store_name: string;
  welcome_message: string;
  support_username: string | null;
  channel_username: string | null;
  admin_telegram_id: number | null;
  btc_address: string | null;
  ltc_address: string | null;
  usdt_trc20_address: string | null;
  usdt_erc20_address: string | null;
  usdc_erc20_address: string | null;
  auto_confirm: boolean;
  payment_expiry_minutes: number;
  min_topup_usd: number;
  min_purchase_usd: number;
  bonus_unlock_deposit_usd: number;
  amount_tolerance_percent: number;
  banner_image_url: string | null;
  mini_app_url: string | null;
};

/** Public URL of the Telegram Mini App (falls back to the published site). */
export function miniAppUrl(settings: StoreSettings): string {
  const configured = settings.mini_app_url?.trim();
  if (configured) return configured;
  const base =
    process.env["PUBLIC_SITE_URL"]?.trim() ||
    process.env["VITE_SITE_URL"]?.trim() ||
    "https://enrollmentlog.lovable.app";
  return `${base.replace(/\/$/, "")}/app`;
}

export type BotUser = {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  wallet_balance: number;
  /** Portion of the wallet that comes from the signup bonus and cannot be spent yet. */
  locked_bonus?: number;
  is_banned: boolean;
  welcome_bonus_granted?: boolean;
  /** True only on the update that first created this user. */
  is_new?: boolean;
};

/** Wallet money the user is actually allowed to spend right now. */
export function spendable(user: { wallet_balance: number; locked_bonus?: number | null }): number {
  return Math.max(0, Number(user.wallet_balance) - Number(user.locked_bonus ?? 0));
}

/** Unlocks the signup bonus when the user has deposited enough; returns unlocked amount. */
export async function unlockBonusIfEligible(userId: number): Promise<number> {
  const db = await getDb();
  const { data, error } = await db.rpc("unlock_bonus_if_eligible", { _user_id: userId });
  if (error) {
    console.error("[bonus] unlock check failed", error);
    return 0;
  }
  return Number(data ?? 0);
}

/** Live wallet figures for a user. */
export async function getBalances(
  userId: number,
): Promise<{ balance: number; locked: number; spendable: number }> {
  const db = await getDb();
  const { data } = await db
    .from("bot_users")
    .select("wallet_balance, locked_bonus")
    .eq("id", userId)
    .maybeSingle();
  const balance = Number(data?.wallet_balance ?? 0);
  const locked = Number(data?.locked_bonus ?? 0);
  return { balance, locked, spendable: Math.max(0, balance - locked) };
}

export async function getDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Bot tables are written by a trusted server route, so the admin client is used deliberately.
  return supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
}

export async function getSettings(): Promise<StoreSettings> {
  const db = await getDb();
  const { data, error } = await db.from("store_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Store settings row is missing");
  return data as StoreSettings;
}

export function addressFor(settings: StoreSettings, asset: PaymentAsset): string {
  const map: Record<PaymentAsset, string | null> = {
    BTC: settings.btc_address,
    LTC: settings.ltc_address,
    USDT_TRC20: settings.usdt_trc20_address,
    USDT_ERC20: settings.usdt_erc20_address,
    USDC_ERC20: settings.usdc_erc20_address,
  };
  return (map[asset] ?? "").trim();
}

/** Coins that currently have a receiving address configured. */
export function enabledAssets(settings: StoreSettings): PaymentAsset[] {
  const all: PaymentAsset[] = ["BTC", "LTC", "USDT_TRC20", "USDT_ERC20", "USDC_ERC20"];
  return all.filter((asset) => addressFor(settings, asset).length > 0);
}

export async function getOrCreateUser(from: {
  id: number;
  username?: string;
  first_name?: string;
}): Promise<BotUser> {
  const db = await getDb();
  const { data: existing } = await db
    .from("bot_users")
    .select("*")
    .eq("telegram_id", from.id)
    .maybeSingle();
  if (existing) {
    if (existing.username !== (from.username ?? null)) {
      await db
        .from("bot_users")
        .update({ username: from.username ?? null })
        .eq("id", existing.id);
    }
    return { ...(existing as BotUser), is_new: false };
  }
  const { data, error } = await db
    .from("bot_users")
    .insert({
      telegram_id: from.id,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { ...(data as BotUser), is_new: true };
}

/** Sends a message to the configured admin chat, when one is set. */
export async function notifyAdmin(
  settings: StoreSettings,
  text: string,
  markup?: import("./telegram.server").InlineKeyboard,
): Promise<void> {
  if (!settings.admin_telegram_id) return;
  const { sendMessage } = await import("./telegram.server");
  await sendMessage(Number(settings.admin_telegram_id), text, markup);
}

export async function getState(
  chatId: number,
): Promise<{ name: string; data: Record<string, unknown> } | null> {
  const db = await getDb();
  const { data } = await db.from("bot_state").select("state").eq("chat_id", chatId).maybeSingle();
  const state = (data?.state ?? null) as { name?: string; data?: Record<string, unknown> } | null;
  if (!state?.name) return null;
  return { name: state.name, data: state.data ?? {} };
}

export async function setState(
  chatId: number,
  name: string | null,
  data: Record<string, unknown> = {},
): Promise<void> {
  const db = await getDb();
  if (!name) {
    await db.from("bot_state").delete().eq("chat_id", chatId);
    return;
  }
  await db
    .from("bot_state")
    .upsert(
      { chat_id: chatId, state: { name, data }, updated_at: new Date().toISOString() },
      { onConflict: "chat_id" },
    );
}

export async function adjustBalance(
  userId: number,
  amount: number,
  reason: string,
  transactionId?: number | null,
  orderId?: number | null,
): Promise<number> {
  const db = await getDb();
  const { data, error } = await db.rpc("adjust_balance", {
    _user_id: userId,
    _amount: amount,
    _reason: reason,
    _transaction_id: transactionId ?? null,
    _order_id: orderId ?? null,
  });
  if (error) throw error;
  return Number(data);
}

export function isAdmin(settings: StoreSettings, telegramId: number): boolean {
  return settings.admin_telegram_id != null && Number(settings.admin_telegram_id) === telegramId;
}

export function money(value: number | string): string {
  return `$${Number(value).toFixed(2)}`;
}
