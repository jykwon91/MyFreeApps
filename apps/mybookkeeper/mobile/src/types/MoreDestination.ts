import type { MoreMenuItem } from "@platform/mobile";
import type { MoreMenuAccess } from "./MoreMenuAccess";

/** A More menu item, with who may see it and what else it's searched by. */
export type MoreDestination = MoreMenuItem & {
  /** Leave out for everyone; "admin" for owners and admins; "write" for anyone who can change things. */
  access?: MoreMenuAccess;
  /** Other words people look for this by, matched by the All screen's search. */
  keywords?: readonly string[];
};
