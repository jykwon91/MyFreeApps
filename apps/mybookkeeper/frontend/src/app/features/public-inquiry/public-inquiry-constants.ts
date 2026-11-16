/** Bounds mirror the backend PublicInquiryRequest schema (occupant_count, vehicle_count). */
export const MIN_OCCUPANTS = 1;
export const MAX_OCCUPANTS = 10;
export const MIN_VEHICLES = 0;
export const MAX_VEHICLES = 10;

export const OCCUPANT_COUNT_ERRORS = {
  required: "Please enter the number of occupants.",
  notWhole: "Occupants must be a whole number.",
  tooLow: `Please enter at least ${MIN_OCCUPANTS} occupant.`,
  tooHigh: `Maximum is ${MAX_OCCUPANTS} occupants.`,
} as const;

export const VEHICLE_COUNT_ERRORS = {
  required: "Please enter the number of vehicles, or 0.",
  notWhole: "Vehicles must be a whole number.",
  tooLow: "Vehicles can't be negative.",
  tooHigh: `Maximum is ${MAX_VEHICLES} vehicles.`,
} as const;
