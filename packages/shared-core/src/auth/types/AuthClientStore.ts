import type { UnknownAction } from "@reduxjs/toolkit";

/** The part of an app's Redux store the auth client needs: wiping the API cache. */
export interface AuthClientStore {
  dispatch(action: UnknownAction): unknown;
}
