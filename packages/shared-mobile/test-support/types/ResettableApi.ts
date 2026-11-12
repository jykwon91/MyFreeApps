import type { Middleware, UnknownAction } from "@reduxjs/toolkit";

/** An RTK Query api: the middleware every store using it is built with, and the reset it answers to. */
export interface ResettableApi {
  middleware: Middleware;
  util: { resetApiState: () => UnknownAction };
}
