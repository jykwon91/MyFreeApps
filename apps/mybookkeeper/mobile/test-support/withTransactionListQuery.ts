import type { InternalAxiosRequestConfig } from "axios";

type QueryValue = string | number | boolean | string[];

const BOOLEAN_KEYS = new Set(["unassigned", "to_review", "tax_relevant", "active_properties_only"]);
const NUMBER_KEYS = new Set(["tax_year", "limit", "offset"]);
const LIST_KEYS = new Set(["statuses", "transaction_types", "categories", "property_ids", "sort"]);

function paramsFrom(query: URLSearchParams): Record<string, QueryValue> {
  const params: Record<string, QueryValue> = {};
  for (const key of new Set(query.keys())) {
    const value = query.get(key) ?? "";
    if (LIST_KEYS.has(key)) params[key] = query.getAll(key);
    else if (BOOLEAN_KEYS.has(key)) params[key] = value === "true";
    else if (NUMBER_KEYS.has(key)) params[key] = Number(value);
    else params[key] = value;
  }
  return params;
}

const LIST_PATH = "/transactions";

/**
 * A transaction list request as the backend reads it: `/transactions` in `url` and its query
 * string, list filters repeated, read back into typed `params`. Any other request is unchanged.
 */
export function withTransactionListQuery(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const [path, query] = (config.url ?? "").split("?");
  if (path !== LIST_PATH || query === undefined) return config;
  return { ...config, url: path, params: { ...config.params, ...paramsFrom(new URLSearchParams(query)) } };
}
