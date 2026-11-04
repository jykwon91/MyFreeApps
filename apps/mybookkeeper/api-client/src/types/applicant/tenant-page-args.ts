export interface TenantPageArgs {
  include_ended: boolean;
  /** The host's date, so the server and the phone agree on whose lease has run out. */
  today: string;
}
