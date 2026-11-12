/** Body of `PATCH /users/me` for the name. A blank name is stored as none. */
export interface AccountNameUpdate {
  name: string;
}
