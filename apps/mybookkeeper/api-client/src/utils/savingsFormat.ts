import { format } from "date-fns";

const WHOLE_DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** A yearly saving as whole dollars: "$120", or "$120–$300" when it is a range. */
export function formatSavingsRange(lowCents: number, highCents: number): string {
  const low = WHOLE_DOLLARS.format(Math.round(lowCents / 100));
  const high = WHOLE_DOLLARS.format(Math.round(highCents / 100));
  return low === high ? low : `${low}–${high}`;
}

/** Whole dollars for a card's terms: "$4,000". */
export function formatWholeDollars(dollars: number): string {
  return WHOLE_DOLLARS.format(dollars);
}

/** A timestamp as "Nov 27, 3:05 PM" in the viewer's time zone. */
export function formatSavingsTime(value: string): string {
  return format(new Date(value), "MMM d, h:mm a");
}

/** A date-only ISO string as "Dec 31, 2026"; parsed as local midnight so it never shifts a day. */
export function formatSavingsDate(value: string): string {
  return format(new Date(`${value}T00:00:00`), "MMM d, yyyy");
}

const URL_HOST = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^/?#:]+)/i;

/**
 * A source link's site, without "www.": "chase.com". Falls back to the raw text when it isn't a URL.
 * A pattern rather than ``URL``: this package runs on the phone too, without the DOM's URL parser.
 */
export function sourceSiteName(url: string): string {
  const host = URL_HOST.exec(url)?.[1];
  return host === undefined ? url : host.toLowerCase().replace(/^www\./, "");
}
