/** ``PUT /properties/{id}/estimated-value``. Null clears it. Dated today by the server. */
export interface PropertyValueUpdateRequest {
  estimated_value_cents: number | null;
}
