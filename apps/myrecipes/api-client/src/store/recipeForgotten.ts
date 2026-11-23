import { createAction } from "@reduxjs/toolkit";

/** The recipe is gone (deleted, or found gone): each slice drops what it holds for it. */
export const recipeForgotten = createAction<string>("recipes/recipeForgotten");
