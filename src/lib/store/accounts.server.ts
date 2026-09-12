/**
 * Mini App accounts: automatic registration on /start, password login and sessions.
 *
 * Every Telegram user that presses Start is registered automatically with a
 * username, a numeric user id and a generated password. The password is only
 * ever stored as a PBKDF2 hash; the plain value is shown once in the bot chat.
 */
import { getDb, type BotUser } from "./db.server";

const PBKDF2_ITERATIONS = 120_000;
const SESSION_DAYS = 30;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return [...value].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return toHex(bits);
}

async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatePassword(length = 10): string {
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  return [...random].map((n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join("");
}

function baseUsername(user: BotUser): string {
  const raw = (user.username ?? user.first_name ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (raw.length >= 3) return raw.slice(0, 20);
  return `user${String(user.telegram_id).slice(-6)}`;
}

async function uniqueUsername(user: BotUser): Promise<string> {
  const db = await getDb();
  const base = baseUsername(user);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    const { data } = await db
      .from("bot_users")
      .select("id")
      .ilike("login_username", candidate)
      .maybeSingle();
    if (!data || data.id === user.id) return candidate;
  }
  return `${base}${randomHex(3)}`;
}

export type Credentials = { username: string; userId: number; password: string };

/**
 * Makes sure the user has Mini App credentials. Returns the plain password only
 * the first time (or when `reset` is requested) so it can be shown once.
 */
export async function ensureCredentials(
  user: BotUser,
  options: { reset?: boolean } = {},
): Promise<{ username: string; userId: number; password: string | null }> {
  const db = await getDb();
  const { data: row } = await db
    .from("bot_users")
    .select("login_username, password_hash")
    .eq("id", user.id)
    .maybeSingle();

  const hasPassword = Boolean(row?.password_hash);
  const username = row?.login_username ?? (await uniqueUsername(user));

  if (hasPassword && !options.reset) {
    if (!row?.login_username) {
      await db.from("bot_users").update({ login_username: username }).eq("id", user.id);
    }
    return { username, userId: user.id, password: null };
  }

  const password = generatePassword();
  const salt = randomHex(16);
  await db
    .from("bot_users")
    .update({
      login_username: username,
      password_salt: salt,
      password_hash: await hashPassword(password, salt),
      credentials_sent_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return { username, userId: user.id, password };
}

export async function createSession(userId: number): Promise<string> {
  const db = await getDb();
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  const { error } = await db.from("miniapp_sessions").insert({
    user_id: userId,
    token_hash: await sha256(token),
    expires_at: expires,
  });
  if (error) throw new Error("Could not start your session, please try again");
  return token;
}

export async function userFromSession(token: string): Promise<BotUser> {
  const db = await getDb();
  const { data: session } = await db
    .from("miniapp_sessions")
    .select("id, user_id, expires_at")
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  if (!session) throw new Error("Please sign in again");
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db.from("miniapp_sessions").delete().eq("id", session.id);
    throw new Error("Your session expired, please sign in again");
  }
  await db
    .from("miniapp_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id);

  const { data: user } = await db
    .from("bot_users")
    .select("*")
    .eq("id", session.user_id)
    .maybeSingle();
  if (!user) throw new Error("Account not found");
  return user as BotUser;
}

export async function signOutSession(token: string): Promise<void> {
  const db = await getDb();
  await db.from("miniapp_sessions").delete().eq("token_hash", await sha256(token));
}

/** Username + password login. Returns a session token. */
export async function loginWithPassword(
  username: string,
  password: string,
): Promise<{ token: string; user: BotUser }> {
  const db = await getDb();
  const { data } = await db
    .from("bot_users")
    .select("*")
    .ilike("login_username", username.trim())
    .maybeSingle();
  const user = data as (BotUser & { password_hash?: string; password_salt?: string }) | null;
  if (!user?.password_hash || !user.password_salt) {
    throw new Error("Wrong username or password");
  }
  const attempt = await hashPassword(password, user.password_salt);
  if (attempt !== user.password_hash) throw new Error("Wrong username or password");
  if (user.is_banned) throw new Error("Your account is suspended");
  return { token: await createSession(user.id), user: user as BotUser };
}
