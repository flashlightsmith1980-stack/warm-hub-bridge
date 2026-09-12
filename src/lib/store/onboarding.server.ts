/** New-user onboarding: animated welcome, signup bonus and admin alerts. */
import {
  adjustBalance,
  getDb,
  money,
  notifyAdmin,
  type BotUser,
  type StoreSettings,
} from "./db.server";
import {
  escapeHtml,
  getChatMember,
  sendMessage,
  editMessage,
  type InlineKeyboard,
} from "./telegram.server";

export const SIGNUP_BONUS_USD = 3;

const WELCOME_FRAMES = [
  "✨",
  "✨🎊",
  "✨🎊🎉",
  "🎉 <b>W</b>",
  "🎉 <b>WEL</b>",
  "🎉 <b>WELCO</b>",
  "🎉 <b>WELCOME!</b> 🎉",
];

const BONUS_FRAMES = [
  "🎁",
  "🎁💫",
  "🎁💫💰",
  "💰 <b>$1.00</b> …",
  "💰 <b>$2.00</b> …",
  "💰 <b>$3.00</b> 🎉",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Plays a short frame-by-frame animation in one chat message. */
async function animate(chatId: number, frames: string[], delayMs = 450): Promise<number | null> {
  const first = (await sendMessage(chatId, frames[0] ?? "✨")) as { message_id?: number } | null;
  const messageId = first?.message_id;
  if (!messageId) return null;
  for (const frame of frames.slice(1)) {
    await sleep(delayMs);
    await editMessage(chatId, messageId, frame);
  }
  return messageId;
}

export function welcomeCelebrationText(settings: StoreSettings, user: BotUser): string {
  const name = escapeHtml(user.first_name || user.username || "friend");
  return [
    "🎉🎉  <b>W E L C O M E !</b>  🎉🎉",
    "",
    `Hey <b>${name}</b> — you just joined <b>${escapeHtml(settings.store_name)}</b> 🚀`,
    "",
    "⚡️ Instant delivery on every order",
    "🔐 Fresh, verified digital products",
    "💳 Pay with BTC · USDT (TRC20) · USDC (ETH)",
    "🕒 24/7 automated store — buy any time",
    "",
    "🥳 Stay tuned… a little gift is landing in your wallet right now 👇",
  ].join("\n");
}

function bonusText(balance: number): string {
  return [
    "💸✨  <b>SUBSCRIPTION BONUS UNLOCKED</b>  ✨💸",
    "",
    `🎁 <b>${money(SIGNUP_BONUS_USD)}</b> has been added to your wallet — free, on us.`,
    "",
    `💰 New balance: <b>${money(balance)}</b>`,
    "",
    "🔓 <b>How to unlock it:</b> make your first deposit of <b>$5</b> or more and the bonus becomes",
    "spendable instantly, on top of whatever you deposit.",
    "",
    "🚀 No delay, no stress — top up and start cashing out with us today!",
  ].join("\n");
}

/**
 * Runs once per user: animated welcome, then an animated $3 bonus that is
 * credited atomically (the flag update guards against double crediting).
 */
export async function runOnboarding(
  chatId: number,
  user: BotUser,
  settings: StoreSettings,
  menu: InlineKeyboard,
): Promise<void> {
  const db = await getDb();
  if (settings.channel_username) {
    const channel = settings.channel_username.replace(/^@/, "");
    const membership = await getChatMember(`@${channel}`, user.telegram_id);
    const joined = Boolean(
      (membership && ["creator", "administrator", "member"].includes(membership.status)) ||
      (membership?.status === "restricted" && membership.is_member),
    );
    if (!joined) {
      await sendMessage(
        chatId,
        [
          "👋 Welcome! Join our channel to unlock your $3 welcome bonus.",
          "",
          "After joining, tap <b>I joined the channel</b> and we will verify your membership before crediting your wallet.",
        ].join("\n"),
        [
          [{ text: "📣 Join our channel", url: `https://t.me/${channel}` }],
          [{ text: "✅ I joined the channel", callback_data: "channel:check" }],
        ],
      );
      return;
    }
  }
  const { data: claimed } = await db
    .from("bot_users")
    .update({ welcome_bonus_granted: true })
    .eq("id", user.id)
    .eq("welcome_bonus_granted", false)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  await animate(chatId, WELCOME_FRAMES);
  await sendMessage(chatId, welcomeCelebrationText(settings, user), menu);

  let balance = Number(user.wallet_balance) + SIGNUP_BONUS_USD;
  try {
    balance = await adjustBalance(user.id, SIGNUP_BONUS_USD, "Subscription welcome bonus");
    await db
      .from("bot_users")
      .update({ locked_bonus: SIGNUP_BONUS_USD })
      .eq("id", user.id);
  } catch (error) {
    console.error("[onboarding] bonus credit failed", error);
    await db.from("bot_users").update({ welcome_bonus_granted: false }).eq("id", user.id);
    return;
  }

  await animate(chatId, BONUS_FRAMES, 400);
  await sendMessage(chatId, bonusText(balance), menu);

  await notifyAdmin(
    settings,
    [
      "🆕 <b>New user joined</b>",
      `Name: <b>${escapeHtml(user.first_name || "-")}</b>`,
      `Username: ${user.username ? `@${escapeHtml(user.username)}` : "—"}`,
      `Telegram ID: <code>${user.telegram_id}</code>`,
      `Welcome bonus: <b>${money(SIGNUP_BONUS_USD)}</b> credited`,
    ].join("\n"),
  );
}
