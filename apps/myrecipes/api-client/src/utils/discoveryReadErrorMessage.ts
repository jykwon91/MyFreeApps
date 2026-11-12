import { requestErrorStatus } from "./requestErrorStatus";

/** What to tell the user when opening one discovered recipe fails. */
export function discoveryReadErrorMessage(error: unknown): string {
  switch (requestErrorStatus(error)) {
    case 422:
      return "We couldn't read a recipe off that page. Open the original to see it.";
    case 400:
      return "That page can't be opened from here.";
    case 429:
      return "You've opened a lot of recipes in the last hour. Give it a few minutes.";
    default:
      return "We couldn't open that one — try another result.";
  }
}
