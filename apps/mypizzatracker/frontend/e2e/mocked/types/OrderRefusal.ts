/** How the backend refuses an order: the HTTP status and the `detail` the customer is shown. */
export interface OrderRefusal {
  status: number;
  detail: string;
}
