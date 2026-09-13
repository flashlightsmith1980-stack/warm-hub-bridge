import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a USD amount for display. */
export function money(value: unknown) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value) || 0,
  );
}

/** Human stock label: unlimited downloads, exact counts otherwise. */
export function stockLabel(stock: number | null | undefined, unlimited: boolean) {
  if (unlimited) return "Unlimited";
  const count = Number(stock ?? 0);
  if (count <= 0) return "Out of stock";
  return count === 1 ? "1 in stock" : `${count} in stock`;
}
