/**
 * One Discord Activity URL Mapping — the same shape the Developer Portal's
 * Activities → URL Mappings table takes and the Embedded App SDK's
 * `patchUrlMappings` / `attemptRemap` consume.
 *
 *  - `prefix`: path on the Activity's own origin
 *    (`https://<client_id>.discordsays.com<prefix>/…`), e.g. `/r2/{subdomain}`.
 *  - `target`: host (+ optional path) Discord's proxy forwards to, WITHOUT a
 *    protocol, e.g. `{subdomain}.r2.cloudflarestorage.com`. `{name}` tokens
 *    capture a host label and are substituted into the prefix.
 *
 * Every mapping passed to the SDK must also exist in the Developer Portal —
 * the SDK only rewrites URLs; Discord's proxy is what forwards them.
 */
export interface DiscordUrlMapping {
  prefix: string;
  target: string;
}
