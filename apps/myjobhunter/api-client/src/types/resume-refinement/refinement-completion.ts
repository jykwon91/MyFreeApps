/**
 * Where the session stands on finishing: `hidden` while targets remain, `reviewed` once every one
 * is through, `empty` when the review found nothing, `completed` once marked done.
 */
export type RefinementCompletion = "hidden" | "reviewed" | "empty" | "completed";
