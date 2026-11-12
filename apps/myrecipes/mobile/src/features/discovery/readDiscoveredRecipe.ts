import discoveryApi from "@myrecipes/api-client/store/discoveryApi";
import type { DiscoveredDetail, DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";
import { discoveryReadErrorMessage } from "@myrecipes/api-client/utils/discoveryReadErrorMessage";
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { DiscoveryState } from "../../types/DiscoveryState";

/**
 * Reads one discovered page in full. Kept in the store rather than the screen, so leaving the
 * screen mid-read doesn't throw the answer away: the request carries on and reopening the result
 * shows it, without paying for a second read. A read already running or done isn't started again.
 */
export const readDiscoveredRecipe = createAsyncThunk<
  DiscoveredDetail,
  DiscoveredRecipe,
  { state: { discovery: DiscoveryState }; rejectValue: string; pendingMeta: { startedAt: number } }
>(
  "discovery/read",
  async (recipe, { dispatch, rejectWithValue }) => {
    const request = dispatch(discoveryApi.endpoints.readWebRecipe.initiate({ url: recipe.url, title: recipe.title }));
    try {
      return await request.unwrap();
    } catch (error) {
      return rejectWithValue(discoveryReadErrorMessage(error));
    } finally {
      request.reset();
    }
  },
  {
    condition: (recipe, { getState }) => {
      const status = getState().discovery.reads[recipe.id]?.status;
      return status !== "reading" && status !== "read";
    },
    getPendingMeta: () => ({ startedAt: Date.now() }),
  },
);
