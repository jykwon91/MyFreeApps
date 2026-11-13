import type { CurrentUser } from "@platform/core/types/user/current-user";
import type { ApiBaseOption } from "./ApiBaseOption";
import type { RefusedWrite } from "./RefusedWrite";

export interface AccountApiStubOptions<TUser extends object = CurrentUser> extends ApiBaseOption {
  /** What GET /users/me answers before any write; TEST_USER unless given. */
  user?: TUser;
  /** Refuse every PATCH and DELETE this way; unless given, a PATCH answers 200 and a DELETE 204. */
  refuse?: RefusedWrite;
}
