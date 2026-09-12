/** USD price lookup for supported assets using free public endpoints. */

export type PaymentAsset = "BTC" | "USDT_TRC20" | "USDT_ERC20" | "USDC_ERC20" | "LTC";

export const ALL_ASSETS: PaymentAsset[] = [
  "BTC",
  "LTC",
  "USDT_TRC20",
  "USDT_ERC20",
  "USDC_ERC20",
];

export const ASSET_LABEL: Record<PaymentAsset, string> = {
  BTC: "Bitcoin (BTC)",
  LTC: "Litecoin (LTC)",
  USDT_TRC20: "USDT (TRC20 / TRON)",
  USDT_ERC20: "USDT (Ethereum ERC20)",
  USDC_ERC20: "USDC (Ethereum ERC20)",
};

export const ASSET_NETWORK: Record<PaymentAsset, string> = {
  BTC: "Bitcoin mainnet",
  LTC: "Litecoin mainnet",
  USDT_TRC20: "TRON (TRC20)",
  USDT_ERC20: "Ethereum mainnet (ERC20)",
  USDC_ERC20: "Ethereum mainnet (ERC20)",
};

export const ASSET_TICKER: Record<PaymentAsset, string> = {
  BTC: "BTC",
  LTC: "LTC",
  USDT_TRC20: "USDT",
  USDT_ERC20: "USDT",
  USDC_ERC20: "USDC",
};

export const ASSET_DECIMALS: Record<PaymentAsset, number> = {
  BTC: 8,
  LTC: 8,
  USDT_TRC20: 2,
  USDT_ERC20: 2,
  USDC_ERC20: 2,
};

const COINGECKO_IDS: Partial<Record<PaymentAsset, string>> = {
  BTC: "bitcoin",
  LTC: "litecoin",
};

/** Returns how many USD one unit of the asset is worth. */
export async function getUsdPrice(asset: PaymentAsset): Promise<number> {
  const geckoId = COINGECKO_IDS[asset];
  if (!geckoId) return 1;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
    );
    if (res.ok) {
      const data = (await res.json()) as Record<string, { usd?: number }>;
      const price = data[geckoId]?.usd;
      if (typeof price === "number" && price > 0) return price;
    }
  } catch (error) {
    console.error("[rates] coingecko failed", error);
  }
  if (asset === "BTC") {
    try {
      const res = await fetch("https://mempool.space/api/v1/prices");
      if (res.ok) {
        const data = (await res.json()) as { USD?: number };
        if (typeof data.USD === "number" && data.USD > 0) return data.USD;
      }
    } catch (error) {
      console.error("[rates] mempool prices failed", error);
    }
  }
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${ASSET_TICKER[asset]}USDT`,
    );
    if (res.ok) {
      const data = (await res.json()) as { price?: string };
      const price = Number(data.price);
      if (Number.isFinite(price) && price > 0) return price;
    }
  } catch (error) {
    console.error("[rates] binance failed", error);
  }
  throw new Error(
    `Unable to fetch the ${ASSET_TICKER[asset]} price right now. Please try again in a moment.`,
  );
}

export function formatAmount(amount: number, asset: PaymentAsset): string {
  return amount.toFixed(ASSET_DECIMALS[asset]);
}
