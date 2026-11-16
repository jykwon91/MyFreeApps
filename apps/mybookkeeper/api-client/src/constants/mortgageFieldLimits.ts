/** The rate must sit strictly between 0 and this, as the server requires. */
export const MORTGAGE_MAX_RATE_PCT = 25;
/** The rate column keeps three decimals (Numeric(6, 3)), so 7.1255 would be silently rounded. */
export const MORTGAGE_RATE_MAX_DECIMALS = 3;
export const MORTGAGE_MAX_TERM_MONTHS = 600;
