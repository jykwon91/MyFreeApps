/** The days a stretch covers, as YYYY-MM-DD. */
export interface DayBounds {
  startDate: string;
  endDate: string;
}

/**
 * Cuts a stretch (a month, a quarter) down to the dates being looked at, so a number made from part of a
 * month opens only the rows it counted. Dates that are not set leave that side as it was.
 */
export function clipDates(bounds: DayBounds, limits: { startDate?: string; endDate?: string }): DayBounds {
  return {
    startDate: limits.startDate && limits.startDate > bounds.startDate ? limits.startDate : bounds.startDate,
    endDate: limits.endDate && limits.endDate < bounds.endDate ? limits.endDate : bounds.endDate,
  };
}
