import { MENU_PRICE_ERRORS, MENU_PRICE_MAX, MENU_PRICE_MAX_DECIMALS } from "@/constants/menuPrice";

/** Error message for a menu price string, or null when it is a valid non-negative amount with at most 2 decimals. */
export function validateMenuPrice(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text === "") return MENU_PRICE_ERRORS.required;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) return MENU_PRICE_ERRORS.invalid;
  if (text.startsWith("-") && Number(text) !== 0) return MENU_PRICE_ERRORS.negative;
  const decimals = text.split(".")[1] ?? "";
  if (decimals.length > MENU_PRICE_MAX_DECIMALS) return MENU_PRICE_ERRORS.decimals;
  if (Number(text) > MENU_PRICE_MAX) return MENU_PRICE_ERRORS.tooLarge;
  return null;
}
