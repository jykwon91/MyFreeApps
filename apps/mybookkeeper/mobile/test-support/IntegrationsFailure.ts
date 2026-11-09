/** A status the route answers with (and the server's own `detail`, if the test needs one), "offline" for no answer, or "hold" for never. */
export type IntegrationsFailure = { status: number; detail?: string } | "offline" | "hold";
