import type { Dispatch, MiddlewareAPI } from "@reduxjs/toolkit";
import type { ResettableApi } from "./ResettableApi";

/** The stores built with each api, as they passed through its middleware. */
export type BuiltStores = Map<ResettableApi, MiddlewareAPI<Dispatch>[]>;
