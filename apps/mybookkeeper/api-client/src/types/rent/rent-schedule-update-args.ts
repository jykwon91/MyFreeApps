import type { RentScheduleUpdateRequest } from "./rent-schedule-update-request";

export interface RentScheduleUpdateArgs extends Omit<RentScheduleUpdateRequest, "today"> {
  scheduleId: string;
}
