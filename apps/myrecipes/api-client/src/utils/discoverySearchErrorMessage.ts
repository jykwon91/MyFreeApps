import { discoveryErrorStatus } from "./discoveryErrorStatus";

/** What to tell the user when a discovery search fails. */
export function discoverySearchErrorMessage(error: unknown): string {
  switch (discoveryErrorStatus(error)) {
    case 422:
      return "We couldn't find recipes for that. Try a dish name, like “mexican flan”.";
    case 429:
      return "You've run a lot of searches in the last hour. Give it a few minutes and try again.";
    case 503:
      return "Recipe discovery isn't available right now. Try again shortly.";
    default:
      return "Something went wrong searching — please try again.";
  }
}
