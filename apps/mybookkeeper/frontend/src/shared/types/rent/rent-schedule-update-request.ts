/** Amount and cadence are deliberately absent — a rent change ends this
 *  schedule and starts a new one so past charges keep the rate they were
 *  generated at. */
export interface RentScheduleUpdateRequest {
  end_date?: string | null;
  grace_days?: number | null;
  notes?: string | null;
}
