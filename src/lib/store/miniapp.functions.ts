import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Mini App callers authenticate with Telegram initData or a password session token. */
const auth = z
  .object({
    initData: z.string().min(1).max(4096).optional().nullable(),
    token: z.string().min(16).max(200).optional().nullable(),
  })
  .refine((value) => Boolean(value.initData || value.token), { message: "Please sign in" });

const pick = (data: { initData?: string | null; token?: string | null }) => ({
  initData: data.initData ?? null,
  token: data.token ?? null,
});

export const miniappLogin = createServerFn({ method: "POST" })
  .validator((data) =>
    z
      .object({
        username: z.string().min(2).max(60),
        password: z.string().min(4).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { loginWithPassword } = await import("./accounts.server");
    const { token, user } = await loginWithPassword(data.username, data.password);
    return { token, userId: user.id };
  });

export const miniappLogout = createServerFn({ method: "POST" })
  .validator((data) => z.object({ token: z.string().min(16).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { signOutSession } = await import("./accounts.server");
    await signOutSession(data.token);
    return { ok: true };
  });

export const miniappBootstrap = createServerFn({ method: "POST" })
  .validator((data) => auth.parse(data))
  .handler(async ({ data }) => {
    const { bootstrap } = await import("./miniapp.server");
    return bootstrap(pick(data));
  });

export const miniappAddToCart = createServerFn({ method: "POST" })
  .validator((data) =>
    auth.and(z.object({ productId: z.number().int().positive() })).parse(data),
  )
  .handler(async ({ data }) => {
    const { addItem } = await import("./miniapp.server");
    return addItem(pick(data), data.productId);
  });

export const miniappRemoveFromCart = createServerFn({ method: "POST" })
  .validator((data) =>
    auth.and(z.object({ cartItemId: z.number().int().positive() })).parse(data),
  )
  .handler(async ({ data }) => {
    const { removeItem } = await import("./miniapp.server");
    return removeItem(pick(data), data.cartItemId);
  });

export const miniappCheckout = createServerFn({ method: "POST" })
  .validator((data) => auth.parse(data))
  .handler(async ({ data }) => {
    const { pay } = await import("./miniapp.server");
    return pay(pick(data));
  });

export const miniappTopUp = createServerFn({ method: "POST" })
  .validator((data) =>
    auth
      .and(
        z.object({
          asset: z.enum(["BTC", "USDT_TRC20", "USDC_ERC20"]),
          amountUsd: z.number().positive().max(100000),
        }),
      )
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { topUp } = await import("./miniapp.server");
    return topUp(pick(data), data.asset, data.amountUsd);
  });

export const miniappSubmitHash = createServerFn({ method: "POST" })
  .validator((data) =>
    auth
      .and(z.object({ txId: z.number().int().positive(), hash: z.string().min(6).max(200) }))
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { submitHash } = await import("./miniapp.server");
    return submitHash(pick(data), data.txId, data.hash.trim());
  });

export const miniappMarkNoteRead = createServerFn({ method: "POST" })
  .validator((data) => auth.and(z.object({ noteId: z.number().int().positive() })).parse(data))
  .handler(async ({ data }) => {
    const { markNoteRead } = await import("./miniapp.server");
    return markNoteRead(pick(data), data.noteId);
  });
