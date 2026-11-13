/** What page.route() accepts as its URL filter: a glob, a RegExp or a predicate. */
export type RouteMatcher = string | RegExp | ((url: URL) => boolean);
