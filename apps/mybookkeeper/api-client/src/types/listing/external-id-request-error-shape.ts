/** An RTK Query error for a 4xx that carries the server's `detail`. */
export interface ExternalIdRequestErrorShape {
  data?: { detail?: string };
  status?: number;
}
