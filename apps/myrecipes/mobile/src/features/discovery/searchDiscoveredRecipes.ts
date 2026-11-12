import discoveryApi from "@myrecipes/api-client/store/discoveryApi";
import type { DiscoveryResults } from "@myrecipes/api-client/types/recipe/discovery";
import { discoverySearchErrorMessage } from "@myrecipes/api-client/utils/discoverySearchErrorMessage";
import { createAsyncThunk } from "@reduxjs/toolkit";

/**
 * Searches the web for versions of a dish. Kept in the store, so switching tabs mid-search loses
 * nothing. The slice takes only the latest search's answer, so a newer search, or another account
 * signing in, wins over one still running.
 */
export const searchDiscoveredRecipes = createAsyncThunk<
  DiscoveryResults,
  string,
  { rejectValue: string; pendingMeta: { startedAt: number } }
>(
  "discovery/search",
  async (query, { dispatch, rejectWithValue }) => {
    const request = dispatch(discoveryApi.endpoints.searchWebRecipes.initiate(query));
    try {
      return await request.unwrap();
    } catch (error) {
      return rejectWithValue(discoverySearchErrorMessage(error));
    } finally {
      request.reset();
    }
  },
  { getPendingMeta: () => ({ startedAt: Date.now() }) },
);
