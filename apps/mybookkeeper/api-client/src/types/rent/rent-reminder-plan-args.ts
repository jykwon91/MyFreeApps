import type { RentReminderPlanRequest } from "./rent-reminder-plan-request";

export interface RentReminderPlanArgs extends RentReminderPlanRequest {
  applicantId: string;
}
