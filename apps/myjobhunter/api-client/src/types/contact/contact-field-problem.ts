/**
 * What's wrong with one add-contact field. Each surface words it its own way.
 * - `identity_required`: neither a name nor an email (reported on `name`)
 * - `invalid`: an email that isn't one plain address, or a profile link that isn't http(s)
 * - `too_long`: over the backend's limit for that field
 */
export type ContactFieldProblem = "identity_required" | "invalid" | "too_long";
