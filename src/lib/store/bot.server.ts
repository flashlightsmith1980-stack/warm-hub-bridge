/** Telegram update dispatcher for the store bot. */
import { adminMenu, handleAdminCallback, handleAdminState, showAdminMenu } from "./admin.server";
import {
  getDb,
  getOrCreateUser,
  getSettings,
  getState,
  isAdmin,
  miniAppUrl,
  money,
  setState,
  type BotUser,
  type StoreSettings,
} from "./db.server";
import { ASSET_LABEL, formatAmount, type PaymentAsset } from "./rates.server";
import {
  createInvoice,
  invoiceKeyboard,
  invoiceText,
  notifyAdminPending,
  verifyAndSettle,
  type Transaction,
} from "./payments.server";
import {
  addToCart,
  availableStock,
  cartKeyboard,
  cartText,
  checkout,
  getCategory,
  getCart,
  getProduct,
  getSubcategory,
  listCategories,
  listOrders,
  listProducts,
  listProductsBySubcategory,
  listFeaturedProducts,
  listSubcategories,
  stockMap,
  orderDetail,
  type Product,
} from "./shop.server";
import {
  answerCallback,
  editCard,
  editMessage,
  escapeHtml,
  sendCard,
  sendMessage,
  type InlineButton,
  type InlineKeyboard,
} from "./telegram.server";
import { isPlausibleHash } from "./verify.server";

type From = { id: number; username?: string; first_name?: string; is_bot?: boolean };
type TelegramMessage = {
  from?: From;
  chat?: { id?: number };
  text?: unknown;
};
type TelegramCallback = {
  id: string;
  data?: string;
  from?: From;
  message?: { message_id?: number; chat?: { id?: number } };
};
type TelegramUpdate = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallback;
};

function mainMenu(admin: boolean, settings: StoreSettings): InlineKeyboard {
  const rows: InlineKeyboard = [
    [{ text: "🚀 Open store app", web_app: { url: miniAppUrl(settings) } }],
    [{ text: "🛍 Browse products", callback_data: "shop" }],
    [
      { text: "🛒 Cart", callback_data: "cart" },
      { text: "📦 My orders", callback_data: "orders" },
    ],
    [
      { text: "💰 Balance", callback_data: "bal" },
      { text: "➕ Top up", callback_data: "top" },
    ],
    [{ text: "🆘 Support", callback_data: "support" }],
  ];
  if (admin) rows.push([{ text: "🛠 Admin panel", callback_data: "adm" }]);
  return rows;
}

function welcomeText(settings: StoreSettings, user: BotUser): string {
  return [
    `👋 <b>${escapeHtml(settings.store_name)}</b>`,
    "",
    escapeHtml(settings.welcome_message),
    "",
    `Balance: <b>${money(user.wallet_balance)}</b>`,
    "",
    "Top up with BTC, USDT (TRC20) or USDC (Ethereum) and buy instantly.",
  ].join("\n");
}

const ASSETS: PaymentAsset[] = ["BTC", "USDT_TRC20", "USDC_ERC20"];

async function showTopUpAssets(chatId: number, messageId?: number) {
  const text = [
    "➕ <b>Top up your balance</b>",
    "",
    "Choose the coin you want to pay with. You will get a wallet address and the exact amount to send.",
  ].join("\n");
  const markup: InlineKeyboard = [
    ...ASSETS.map((asset) => [{ text: ASSET_LABEL[asset], callback_data: `top:${asset}` }]),
    [{ text: "⬅️ Menu", callback_data: "menu" }],
  ];
  if (messageId) return editMessage(chatId, messageId, text, markup);
  return sendMessage(chatId, text, markup);
}

function productButton(p: Product): InlineButton {
  return {
    text: `${p.is_featured ? "⭐🔥 " : p.image_url ? "🖼 " : ""}${p.name} — $${Number(p.price).toFixed(2)}`.slice(
      0,
      60,
    ),
    callback_data: `prod:${p.id}`,
  };
}

function gridRows(buttons: InlineButton[]): InlineKeyboard {
  const rows: InlineKeyboard = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  return rows;
}

async function showProduct(chatId: number, messageId: number, productId: number) {
  const product = await getProduct(productId);
  if (!product)
    return editMessage(chatId, messageId, "Product not found.", [
      [{ text: "⬅️ Menu", callback_data: "menu" }],
    ]);
  const stock = await availableStock(product);
  const text = [
    `<b>${escapeHtml(product.name)}</b>`,
    "",
    escapeHtml(product.description ?? "No description."),
    "",
    `Price: <b>${money(product.price)}</b>`,
    `Stock: <b>${product.product_type === "file" ? "unlimited" : stock}</b>`,
  ].join("\n");
  const markup: InlineKeyboard = [];
  if (stock > 0) {
    markup.push([{ text: "🛒 Add to cart", callback_data: `cart:add:${product.id}` }]);
    markup.push([{ text: "⚡ Buy now", callback_data: `buy:${product.id}` }]);
  } else {
    markup.push([{ text: "❌ Out of stock", callback_data: "noop" }]);
  }
  const back = product.subcategory_id
    ? `sub:${product.subcategory_id}`
    : product.category_id
      ? `cat:${product.category_id}`
      : "shop";
  markup.push([{ text: "⬅️ Back", callback_data: back }]);
  return editCard(chatId, messageId, product.image_url, text, markup);
}

/** Sends a compact, paginated image-first product gallery. */
async function sendGallery(
  chatId: number,
  products: Product[],
  backData: string,
  scope: "all" | "cat" | "sub" | "featured",
  scopeId?: number,
  page = 0,
) {
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(products.length / pageSize));
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
  const withImages = products.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const stocks = await stockMap(withImages);
  for (const p of withImages) {
    await sendCard(
      chatId,
      p.image_url,
      [
        `${p.is_featured ? "⭐ " : ""}<b>${escapeHtml(p.name)}</b>`,
        escapeHtml((p.description ?? "").slice(0, 300)),
        "",
        `Price: <b>${money(p.price)}</b>`,
        `Stock: <b>${p.product_type === "file" ? "unlimited" : (stocks[p.id] ?? 0)}</b>`,
      ].join("\n"),
      [
        [
          { text: "🛒 Add to cart", callback_data: `cart:add:${p.id}` },
          { text: "⚡ Buy now", callback_data: `buy:${p.id}` },
        ],
        [{ text: "🔎 Details", callback_data: `prod:${p.id}` }],
      ],
    );
  }
  const galleryKey = scopeId == null ? `gal:${scope}` : `gal:${scope}:${scopeId}`;
  const navigation: InlineKeyboard = [];
  if (currentPage > 0)
    navigation.push([{ text: "◀️ Previous", callback_data: `${galleryKey}:${currentPage - 1}` }]);
  if (currentPage < pageCount - 1)
    navigation.push([{ text: "Next ▶️", callback_data: `${galleryKey}:${currentPage + 1}` }]);
  navigation.push([{ text: `Page ${currentPage + 1}/${pageCount}`, callback_data: "noop" }]);
  navigation.push(
    [{ text: "⬅️ Back", callback_data: backData }],
    [{ text: "🏠 Menu", callback_data: "menu" }],
  );
  await sendMessage(
    chatId,
    `🛍 <b>Gallery</b> · ${products.length} products\nTap a card action to continue.`,
    navigation,
  );
}

async function showCategories(chatId: number, messageId: number, settings: StoreSettings) {
  const [categories, featured] = await Promise.all([listCategories(), listFeaturedProducts(20)]);
  if (categories.length === 0) {
    const products = await listProducts(null);
    if (products.length === 0) {
      return editCard(
        chatId,
        messageId,
        settings.banner_image_url,
        "🛍 The catalog is empty right now. Please check back soon.",
        [[{ text: "⬅️ Menu", callback_data: "menu" }]],
      );
    }
    return editCard(chatId, messageId, settings.banner_image_url, "🛍 <b>All products</b>", [
      ...gridRows(products.map(productButton)),
      [{ text: "🖼 Open gallery", callback_data: "gal:all:0" }],
      [{ text: "⬅️ Menu", callback_data: "menu" }],
    ]);
  }
  const categoryButtons = categories.map((category) => ({
    text: `${category.image_url ? "🖼 " : "📂 "}${category.name}`,
    callback_data: `cat:${category.id}`,
  }));
  const featuredRows = featured.length
    ? [
        [{ text: "⭐🔥 FEATURED • HOT PRODUCTS 🔥⭐", callback_data: "featured" }],
        ...gridRows(featured.map(productButton)),
      ]
    : [];
  return editCard(
    chatId,
    messageId,
    settings.banner_image_url,
    ["🛍 <b>Choose a category</b>", "", escapeHtml(settings.store_name)].join("\n"),
    [
      ...featuredRows,
      ...gridRows(categoryButtons),
      [{ text: "🖼 Browse all products", callback_data: "gal:all:0" }],
      [{ text: "⭐ Open featured gallery", callback_data: "featured" }],
      [{ text: "⬅️ Menu", callback_data: "menu" }],
    ],
  );
}

async function showCategory(chatId: number, messageId: number, categoryId: number) {
  const category = await getCategory(categoryId);
  if (!category) return showCategoriesFallback(chatId, messageId);
  const subs = await listSubcategories(categoryId);
  const products = (await listProducts(categoryId)).filter((product) => !product.is_featured);
  const rows: InlineKeyboard = [
    ...gridRows(
      subs.map((subcategory) => ({
        text: `${subcategory.image_url ? "🖼 " : "📁 "}${subcategory.name}`,
        callback_data: `sub:${subcategory.id}`,
      })),
    ),
    ...gridRows(products.filter((product) => !product.subcategory_id).map(productButton)),
  ];
  if (products.length > 0)
    rows.push([{ text: "🖼 Open category gallery", callback_data: `gal:cat:${categoryId}:0` }]);
  rows.push([{ text: "⬅️ Categories", callback_data: "shop" }]);
  const text = [
    `📂 <b>${escapeHtml(category.name)}</b>`,
    category.description ? `\n${escapeHtml(category.description)}` : "",
    rows.length === 1 ? "\nNothing here yet." : "",
  ]
    .filter(Boolean)
    .join("\n");
  return editCard(chatId, messageId, category.image_url, text, rows);
}

async function showSubcategory(chatId: number, messageId: number, subcategoryId: number) {
  const sub = await getSubcategory(subcategoryId);
  if (!sub) return showCategoriesFallback(chatId, messageId);
  const products = (await listProductsBySubcategory(subcategoryId)).filter(
    (product) => !product.is_featured,
  );
  const rows: InlineKeyboard = gridRows(products.map(productButton));
  if (products.length > 0)
    rows.push([
      { text: "🖼 Open subcategory gallery", callback_data: `gal:sub:${subcategoryId}:0` },
    ]);
  rows.push([
    { text: "⬅️ Back", callback_data: sub.category_id ? `cat:${sub.category_id}` : "shop" },
  ]);
  const text = [
    `📁 <b>${escapeHtml(sub.name)}</b>`,
    sub.description ? `\n${escapeHtml(sub.description)}` : "",
    products.length === 0 ? "\nNo products here yet." : "",
  ]
    .filter(Boolean)
    .join("\n");
  return editCard(chatId, messageId, sub.image_url, text, rows);
}

async function showCategoriesFallback(chatId: number, messageId: number) {
  return editMessage(chatId, messageId, "Not found.", [
    [{ text: "⬅️ Menu", callback_data: "menu" }],
  ]);
}

async function startTopUpAmount(
  chatId: number,
  messageId: number,
  asset: PaymentAsset,
  settings: StoreSettings,
) {
  await setState(chatId, "topup_amount", { asset });
  await editMessage(
    chatId,
    messageId,
    [
      `Paying with <b>${escapeHtml(ASSET_LABEL[asset])}</b>.`,
      "",
      `Send the amount in USD you want to add to your balance (minimum ${money(settings.min_topup_usd)}).`,
    ].join("\n"),
    [[{ text: "Cancel", callback_data: "menu" }]],
  );
}

async function sendInvoice(chatId: number, tx: Transaction, settings: StoreSettings) {
  await sendMessage(chatId, invoiceText(tx, settings), invoiceKeyboard(tx));
}

async function loadTransaction(id: number): Promise<Transaction | null> {
  const db = await getDb();
  const { data } = await db.from("transactions").select("*").eq("id", id).maybeSingle();
  return (data as Transaction) ?? null;
}

async function doCheckout(chatId: number, user: BotUser) {
  const result = await checkout(user);
  if (!result.ok) {
    await sendMessage(chatId, `❌ ${escapeHtml(result.reason)}`, [
      [{ text: "➕ Top up", callback_data: "top" }],
      [{ text: "⬅️ Menu", callback_data: "menu" }],
    ]);
    return;
  }
  await sendMessage(
    chatId,
    [
      `✅ <b>Order #${result.orderId} completed</b>`,
      `Total: <b>${money(result.total)}</b> · New balance: <b>${money(result.balance)}</b>`,
      "",
      "📄 Preparing your delivery files…",
    ].join("\n"),
  );
  const { fulfillOrder } = await import("./fulfillment.server");
  try {
    const delivery = await fulfillOrder(result.orderId);
    if (!delivery.delivered) {
      await sendMessage(
        chatId,
        "⚠️ Your purchase was completed, but one or more delivery files could not be sent. We will retry automatically, and support has been notified.",
        [
          [{ text: "📦 My orders", callback_data: "orders" }],
          [{ text: "🆘 Support", callback_data: "support" }],
        ],
      );
    }
  } catch (error) {
    console.error("[checkout] fulfillment failed", result.orderId, error);
    await sendMessage(
      chatId,
      "⚠️ Your purchase was completed, but delivery is delayed. We will retry automatically. Please open My orders or contact support.",
      [
        [{ text: "📦 My orders", callback_data: "orders" }],
        [{ text: "🆘 Support", callback_data: "support" }],
      ],
    );
  }
}

async function handleText(
  chatId: number,
  from: From,
  text: string,
  user: BotUser,
  settings: StoreSettings,
) {
  const trimmed = text.trim();
  const admin = isAdmin(settings, from.id);

  if (trimmed.startsWith("/start")) {
    await setState(chatId, null);
    if (!user.welcome_bonus_granted) {
      const { runOnboarding } = await import("./onboarding.server");
      await runOnboarding(chatId, user, settings, mainMenu(admin, settings));
      return;
    }
    await sendCard(
      chatId,
      settings.banner_image_url,
      welcomeText(settings, user),
      mainMenu(admin, settings),
    );
    return;
  }
  if (trimmed === "/menu") {
    await sendCard(
      chatId,
      settings.banner_image_url,
      welcomeText(settings, user),
      mainMenu(admin, settings),
    );
    return;
  }
  if (trimmed === "/balance") {
    await sendMessage(
      chatId,
      `💰 Your balance: <b>${money(user.wallet_balance)}</b>`,
      mainMenu(admin, settings),
    );
    return;
  }
  if (trimmed === "/admin") {
    if (!admin) {
      await sendMessage(chatId, "You are not authorised to use the admin panel.");
      return;
    }
    await showAdminMenu(chatId);
    return;
  }
  if (admin && (trimmed.startsWith("/ban ") || trimmed.startsWith("/unban "))) {
    const db = await getDb();
    const banned = trimmed.startsWith("/ban ");
    const target = Number(trimmed.split(/\s+/)[1]);
    await db.from("bot_users").update({ is_banned: banned }).eq("telegram_id", target);
    await sendMessage(chatId, `${banned ? "🚫 Banned" : "✅ Unbanned"} ${target}.`, adminMenu);
    return;
  }
  if (admin && trimmed.startsWith("/img")) {
    const [, scope, ...rest] = trimmed.split(/\s+/);
    const db = await getDb();
    if (scope === "banner") {
      const url = rest[0];
      if (!url) {
        await sendMessage(chatId, "Usage: <code>/img banner &lt;image url&gt;</code>");
        return;
      }
      await db.from("store_settings").update({ banner_image_url: url }).eq("id", 1);
      await sendMessage(chatId, "🖼 Store banner updated.");
      return;
    }
    const table =
      scope === "cat"
        ? "categories"
        : scope === "sub"
          ? "subcategories"
          : scope === "prod"
            ? "products"
            : null;
    const id = Number(rest[0]);
    const url = rest[1];
    if (!table || !id || !url) {
      await sendMessage(
        chatId,
        [
          "🖼 <b>Set images</b>",
          "<code>/img banner &lt;url&gt;</code>",
          "<code>/img cat &lt;id&gt; &lt;url&gt;</code>",
          "<code>/img sub &lt;id&gt; &lt;url&gt;</code>",
          "<code>/img prod &lt;id&gt; &lt;url&gt;</code>",
        ].join("\n"),
      );
      return;
    }
    const { error } = await db.from(table).update({ image_url: url }).eq("id", id);
    await sendMessage(
      chatId,
      error ? `❌ ${escapeHtml(error.message)}` : `🖼 Image set for ${scope} #${id}.`,
    );
    return;
  }

  const state = await getState(chatId);
  if (state) {
    if (await handleAdminState(chatId, trimmed, state)) return;

    if (state.name === "topup_amount") {
      const amount = Number(trimmed.replace(/[^0-9.]/g, ""));
      if (!amount || amount < Number(settings.min_topup_usd)) {
        await sendMessage(
          chatId,
          `❌ Please send a number of at least ${money(settings.min_topup_usd)}.`,
        );
        return;
      }
      const asset = state.data["asset"] as PaymentAsset;
      await setState(chatId, null);
      try {
        const tx = await createInvoice(user.id, asset, Math.round(amount * 100) / 100, settings);
        await sendInvoice(chatId, tx, settings);
      } catch (error) {
        await sendMessage(
          chatId,
          `❌ ${escapeHtml(error instanceof Error ? error.message : "Could not create the invoice.")}`,
        );
      }
      return;
    }

    if (state.name === "await_hash") {
      const txId = Number(state.data["txId"]);
      const tx = await loadTransaction(txId);
      if (!tx) {
        await setState(chatId, null);
        await sendMessage(chatId, "❌ Invoice not found.", mainMenu(admin, settings));
        return;
      }
      if (!isPlausibleHash(tx.asset, trimmed)) {
        await sendMessage(
          chatId,
          "❌ That does not look like a valid transaction hash. Please paste the TxID again.",
        );
        return;
      }
      const db = await getDb();
      const { error } = await db
        .from("transactions")
        .update({ tx_hash: trimmed, status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", tx.id);
      if (error) {
        await sendMessage(
          chatId,
          "❌ This transaction hash was already submitted for another invoice.",
        );
        return;
      }
      await setState(chatId, null);
      await sendMessage(chatId, "🔎 Checking your transaction on-chain, one moment…");
      const outcome = await verifyAndSettle(
        { ...tx, tx_hash: trimmed, status: "submitted" },
        settings,
      );
      if (outcome.status !== "credited") {
        await sendMessage(chatId, outcome.message, [
          [{ text: "🔄 Check again", callback_data: `pay:check:${tx.id}` }],
          [{ text: "🏠 Menu", callback_data: "menu" }],
        ]);
      }
      return;
    }

    if (state.name === "dispute_reason") {
      const orderId = Number(state.data["orderId"]);
      const db = await getDb();
      await db.from("disputes").insert({ order_id: orderId, user_id: user.id, reason: trimmed });
      await db.from("orders").update({ dispute_status: "opened" }).eq("id", orderId);
      await setState(chatId, null);
      await sendMessage(
        chatId,
        "⚖️ Your dispute has been opened. An admin will review it shortly.",
        mainMenu(admin, settings),
      );
      if (settings.admin_telegram_id) {
        await sendMessage(
          Number(settings.admin_telegram_id),
          `⚖️ New dispute on order #${orderId} from @${escapeHtml(user.username ?? String(user.telegram_id))}:\n${escapeHtml(trimmed)}`,
        );
      }
      return;
    }

    if (state.name === "support_message") {
      await setState(chatId, null);
      if (settings.admin_telegram_id) {
        await sendMessage(
          Number(settings.admin_telegram_id),
          `🆘 Support message from @${escapeHtml(user.username ?? String(user.telegram_id))} (${user.telegram_id}):\n${escapeHtml(trimmed)}`,
        );
      }
      await sendMessage(
        chatId,
        "🆘 Message sent to support. You will get a reply here.",
        mainMenu(admin, settings),
      );
      return;
    }
  }

  // Fallback: treat a bare hash as a payment submission for the newest open invoice.
  await sendCard(
    chatId,
    settings.banner_image_url,
    welcomeText(settings, user),
    mainMenu(admin, settings),
  );
}

async function handleCallback(
  chatId: number,
  messageId: number,
  callbackId: string,
  data: string,
  from: From,
  user: BotUser,
  settings: StoreSettings,
) {
  const parts = data.split(":");
  const root = parts[0] ?? "";
  const admin = isAdmin(settings, from.id);

  if (root === "adm") {
    if (!admin) {
      await answerCallback(callbackId, "Not authorised", true);
      return;
    }
    await handleAdminCallback(chatId, messageId, callbackId, parts);
    await answerCallback(callbackId);
    return;
  }

  switch (root) {
    case "channel":
      if (parts[1] === "check") {
        const { runOnboarding } = await import("./onboarding.server");
        await runOnboarding(chatId, user, settings, mainMenu(admin, settings));
      }
      break;
    case "menu":
      await setState(chatId, null);
      await editCard(
        chatId,
        messageId,
        settings.banner_image_url,
        welcomeText(settings, user),
        mainMenu(admin, settings),
      );
      break;
    case "shop":
      await showCategories(chatId, messageId, settings);
      break;
    case "featured": {
      const featured = await listFeaturedProducts(100);
      await sendGallery(chatId, featured, "shop", "featured");
      break;
    }
    case "cat": {
      await showCategory(chatId, messageId, Number(parts[1]));
      break;
    }
    case "sub": {
      await showSubcategory(chatId, messageId, Number(parts[1]));
      break;
    }
    case "gal": {
      await answerCallback(callbackId, "Loading gallery…");
      const scope = parts[1];
      const id = Number(parts[2]);
      const pagePart = scope === "all" || scope === "featured" ? parts[2] : parts[3];
      const page = Number.isInteger(Number(pagePart)) ? Number(pagePart) : 0;
      const products =
        scope === "sub"
          ? (await listProductsBySubcategory(id)).filter((product) => !product.is_featured)
          : scope === "featured"
            ? await listFeaturedProducts(100)
            : (await listProducts(scope === "cat" ? id : null)).filter(
                (product) => scope !== "cat" || !product.is_featured,
              );
      const back = scope === "sub" ? `sub:${id}` : scope === "cat" ? `cat:${id}` : "shop";
      if (scope !== "all" && scope !== "cat" && scope !== "sub" && scope !== "featured") {
        await answerCallback(callbackId, "Gallery not found", true);
        break;
      }
      await sendGallery(
        chatId,
        products,
        back,
        scope as "all" | "cat" | "sub" | "featured",
        scope === "cat" || scope === "sub" ? id : undefined,
        page,
      );
      break;
    }
    case "prod":
      await showProduct(chatId, messageId, Number(parts[1]));
      break;
    case "cart": {
      const action = parts[1];
      if (action === "add") {
        await addToCart(user.id, Number(parts[2]));
        await answerCallback(callbackId, "Added to cart ✅");
      } else if (action === "del") {
        const db = await getDb();
        await db.from("cart_items").delete().eq("id", Number(parts[2])).eq("user_id", user.id);
      } else if (action === "checkout") {
        await answerCallback(callbackId, "Processing…");
        await doCheckout(chatId, user);
        return;
      }
      const rows = await getCart(user.id);
      await editMessage(chatId, messageId, cartText(rows), cartKeyboard(rows));
      break;
    }
    case "buy": {
      await addToCart(user.id, Number(parts[1]));
      await answerCallback(callbackId, "Processing…");
      await doCheckout(chatId, user);
      return;
    }
    case "orders": {
      const orders = await listOrders(user.id);
      await editMessage(
        chatId,
        messageId,
        orders.length === 0 ? "📦 You have no orders yet." : "📦 <b>Your orders</b>",
        [
          ...orders.map((o) => [
            {
              text: `#${o.id} · $${Number(o.total_amount).toFixed(2)} · ${o.status}`,
              callback_data: `order:${o.id}`,
            },
          ]),
          [{ text: "⬅️ Menu", callback_data: "menu" }],
        ],
      );
      break;
    }
    case "order": {
      const order = await orderDetail(user.id, Number(parts[1]));
      if (!order) {
        await answerCallback(callbackId, "Order not found", true);
        break;
      }
      await editMessage(
        chatId,
        messageId,
        [
          `📦 <b>Order #${order.id}</b>`,
          `Status: <b>${escapeHtml(order.status)}</b> · Total: <b>${money(order.total_amount)}</b>`,
          "",
          ...order.order_items.map(
            (item) =>
              `<b>${escapeHtml(item.product_name)}</b> × ${item.quantity}\n<code>${escapeHtml(item.delivered_asset ?? "-")}</code>`,
          ),
        ].join("\n"),
        [
          [{ text: "⚖️ Open dispute", callback_data: `dispute:${order.id}` }],
          [{ text: "⬅️ My orders", callback_data: "orders" }],
        ],
      );
      break;
    }
    case "dispute":
      await setState(chatId, "dispute_reason", { orderId: Number(parts[1]) });
      await editMessage(
        chatId,
        messageId,
        "⚖️ Describe the problem with this order in one message.",
        [[{ text: "Cancel", callback_data: "menu" }]],
      );
      break;
    case "bal": {
      const db = await getDb();
      const { data: ledger } = await db
        .from("wallet_ledger")
        .select("amount, reason, created_at")
        .eq("user_id", user.id)
        .order("id", { ascending: false })
        .limit(8);
      const rows = (ledger ?? []) as { amount: number; reason: string; created_at: string }[];
      const { data: fresh } = await db
        .from("bot_users")
        .select("wallet_balance")
        .eq("id", user.id)
        .maybeSingle();
      await editMessage(
        chatId,
        messageId,
        [
          `💰 <b>Balance: ${money(fresh?.wallet_balance ?? user.wallet_balance)}</b>`,
          "",
          rows.length ? "Recent activity:" : "No wallet activity yet.",
          ...rows.map(
            (row) =>
              `${Number(row.amount) >= 0 ? "➕" : "➖"} ${money(Math.abs(Number(row.amount)))} — ${escapeHtml(row.reason)}`,
          ),
        ].join("\n"),
        [
          [{ text: "➕ Top up", callback_data: "top" }],
          [{ text: "⬅️ Menu", callback_data: "menu" }],
        ],
      );
      break;
    }
    case "top": {
      if (parts.length === 1) {
        await showTopUpAssets(chatId, messageId);
        break;
      }
      await startTopUpAmount(chatId, messageId, parts[1] as PaymentAsset, settings);
      break;
    }
    case "pay": {
      const action = parts[1];
      const tx = await loadTransaction(Number(parts[2]));
      if (!tx || tx.user_id !== user.id) {
        await answerCallback(callbackId, "Invoice not found", true);
        break;
      }
      if (action === "hash") {
        await setState(chatId, "await_hash", { txId: tx.id });
        await editMessage(
          chatId,
          messageId,
          [
            `Invoice <code>${escapeHtml(tx.invoice_code)}</code>`,
            `Expected: <code>${formatAmount(Number(tx.expected_amount), tx.asset)}</code>`,
            "",
            "Paste your transaction hash (TxID) here.",
          ].join("\n"),
          [[{ text: "Cancel", callback_data: "menu" }]],
        );
      } else if (action === "cancel") {
        const db = await getDb();
        await db
          .from("transactions")
          .update({ status: "expired" })
          .eq("id", tx.id)
          .in("status", ["pending", "submitted"]);
        await setState(chatId, null);
        await editMessage(chatId, messageId, "❌ Invoice cancelled.", mainMenu(admin, settings));
      } else {
        if (tx.status === "completed") {
          await answerCallback(callbackId, "Already confirmed ✅", true);
          break;
        }
        if (!tx.tx_hash) {
          await answerCallback(callbackId, "Submit your transaction hash first.", true);
          break;
        }
        const outcome = await verifyAndSettle(tx, settings);
        await answerCallback(callbackId, outcome.message.slice(0, 190), true);
      }
      break;
    }
    case "support":
      await setState(chatId, "support_message");
      await editMessage(
        chatId,
        messageId,
        settings.support_username
          ? `🆘 Contact @${escapeHtml(settings.support_username)} or send your message here and we'll pass it on.`
          : "🆘 Send your message and our support team will reply here.",
        [[{ text: "⬅️ Menu", callback_data: "menu" }]],
      );
      break;
    case "noop":
      await answerCallback(callbackId, "This action is not available right now.", true);
      break;
    default:
      await answerCallback(callbackId, "Unknown button action. Please open /menu again.", true);
      break;
  }
  await answerCallback(callbackId);
}

export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const settings = await getSettings();
  const message = update["message"] ?? update["edited_message"];
  const callback = update["callback_query"];
  const from: From | undefined = message?.from ?? callback?.from;
  if (!from || from.is_bot) return;

  const user = await getOrCreateUser(from);
  const chatId = Number(message?.chat?.id ?? callback?.message?.chat?.id ?? from.id);

  if (user.is_banned) {
    if (callback) await answerCallback(callback.id, "Your account is suspended.", true);
    else await sendMessage(chatId, "🚫 Your account has been suspended. Contact support.");
    return;
  }

  if (callback) {
    const callbackId = String(callback.id);
    const messageId = Number(callback.message?.message_id);
    const data = String(callback.data ?? "");
    // Acknowledge FIRST so the button never stays spinning, whatever happens next.
    await answerCallback(callbackId);
    if (!data || !Number.isFinite(messageId)) return;
    try {
      await handleCallback(chatId, messageId, callbackId, data, from, user, settings);
    } catch (error) {
      console.error("[bot] callback failed", data, error);
      await sendMessage(chatId, "⚠️ Something went wrong handling that action. Please try again.", [
        [{ text: "🏠 Menu", callback_data: "menu" }],
      ]);
    }
    return;
  }

  const text = message?.text;
  if (typeof text === "string") {
    await handleText(chatId, from, text, user, settings);
  }
}

/** Re-checks submitted invoices and expires stale ones. Used by the scheduled job. */
export async function sweepPendingPayments(): Promise<{
  checked: number;
  credited: number;
  expired: number;
}> {
  const db = await getDb();
  const settings = await getSettings();
  const { data } = await db
    .from("transactions")
    .select("*")
    .eq("status", "submitted")
    .not("tx_hash", "is", null)
    .order("id", { ascending: true })
    .limit(25);
  const rows = (data ?? []) as Transaction[];
  let credited = 0;
  for (const tx of rows) {
    const outcome = await verifyAndSettle(tx, settings);
    if (outcome.status === "credited") credited += 1;
  }
  const { data: expired } = await db
    .from("transactions")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .select("id");
  return { checked: rows.length, credited, expired: (expired ?? []).length };
}

export async function sendDailyPromo() {
  const db = await getDb();
  const runDate = new Date().toISOString().slice(0, 10);
  const { data: templates } = await db
    .from("message_templates")
    .select("body")
    .eq("category", "advertising")
    .ilike("title", "%daily%")
    .limit(1);
  const featured = await listFeaturedProducts(3);
  const text =
    templates?.[0]?.body ??
    (featured.length
      ? `⭐ Featured today\n\n${featured.map((p) => `${p.name} - ${money(p.price)}`).join("\n")}\n\nOpen the store to shop now.`
      : "⭐ Check out the store today for our latest digital products.");
  const { data: users } = await db
    .from("bot_users")
    .select("id, telegram_id")
    .eq("is_banned", false);
  let sent = 0;
  for (const user of (users ?? []) as { id: number; telegram_id: number }[]) {
    const { data: existing } = await db
      .from("daily_promo_log")
      .select("id")
      .eq("run_date", runDate)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) continue;
    const delivered = await sendMessage(Number(user.telegram_id), text);
    await db
      .from("daily_promo_log")
      .insert({ run_date: runDate, user_id: user.id, sent: delivered !== null });
    if (delivered !== null) sent += 1;
  }
  return { runDate, sent, subscribers: users?.length ?? 0 };
}

export { notifyAdminPending };
