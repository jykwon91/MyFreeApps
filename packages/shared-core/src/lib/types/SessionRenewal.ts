/**
 * What a request refused with a 401 can do next: be sent again with a new sign-in, give up
 * because the sign-in it was sent with is over, or give up because the server couldn't be reached.
 */
export type SessionRenewal = "renewed" | "ended" | "unreachable";
