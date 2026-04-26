import type { DemoUser } from "./demo-user";

export interface DemoUserListResponse {
  users: DemoUser[];
  total: number;
}
