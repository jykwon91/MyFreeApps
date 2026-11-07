export interface QueryStatusFields {
  isError: boolean;
  error: { status: number; data: { detail: string } } | undefined;
  isFetching: boolean;
}
