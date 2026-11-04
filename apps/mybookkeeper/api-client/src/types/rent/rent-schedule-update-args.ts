import type { RentScheduleUpdateRequest } from "./rent-schedule-update-request";

export interface RentScheduleUpdateArgs extends RentScheduleUpdateRequest {
  scheduleId: string;
}
