import { unsignedJwt } from "../unsignedJwt";

/** What a stubbed login endpoint issues: a token the web auth guard accepts. */
export const ISSUED_TOKEN = unsignedJwt();
