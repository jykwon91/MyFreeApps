/** The envelope the server's paged list endpoints answer with. */
export interface ListEnvelope<T> {
  items: T[];
  total: number;
  has_more: boolean;
}
