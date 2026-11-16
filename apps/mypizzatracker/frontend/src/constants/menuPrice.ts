export const MENU_PRICE_MAX_DECIMALS = 2;
export const MENU_PRICE_MAX = 99999999.99;

export const MENU_PRICE_ERRORS = {
  required: "Enter a price",
  invalid: "Enter a valid amount",
  negative: "Price can't be negative",
  decimals: "Use at most 2 decimal places",
  tooLarge: "Price is too large",
} as const;
