import type { DemoUser } from "@/types/demo/demo-user";

/** Response of `GET /admin/demo/users`. */
export interface DemoUserListResponse {
  users: DemoUser[];
  total: number;
}
