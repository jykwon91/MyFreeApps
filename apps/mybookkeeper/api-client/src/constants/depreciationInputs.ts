/** Copy for a rental's depreciation inputs, shared by the web and phone edit screens. */
export const DEPRECIATION_INPUT_MESSAGES = {
  landValue: "Land value",
  landValuePlaceholder: "e.g. 25000",
  landValueHint: "The part of the purchase price that's the land. Land isn't depreciated, so it's left out of the yearly depreciation.",
  // Same wording as the server (backend app/core/depreciation_input_constants.py).
  landValueOverPrice: "Land value can't be more than the purchase price.",
  landValueNeedsPrice: "Enter the purchase price before the land value.",
  landValueRemoved: "A saved land value can be changed but not removed.",
  placedInService: "Date placed in service",
  placedInServiceHint: "When it was first ready to rent. Depreciation on Schedule E starts that month.",
  placedInServiceInFuture: "The date placed in service can't be in the future.",
  placedInServiceRemoved: "A saved date placed in service can be changed but not removed.",
} as const;
