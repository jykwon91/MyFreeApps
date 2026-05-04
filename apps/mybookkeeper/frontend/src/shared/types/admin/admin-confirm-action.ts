import type { AdminConfirmActionType } from "./admin-confirm-action-type";

export interface AdminConfirmAction {
  type: AdminConfirmActionType;
  userId: string;
  email: string;
}
