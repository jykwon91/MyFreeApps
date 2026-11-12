/** The part of `GET /users/me` that holds the name tenants see on rent receipts and emails. */
export interface AccountName {
  id: string;
  name: string | null;
}
