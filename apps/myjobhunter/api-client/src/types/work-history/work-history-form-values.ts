/** A role as the add and edit forms hold it, before it becomes a request. */
export interface WorkHistoryFormValues {
  company_name: string;
  title: string;
  /** "YYYY-MM-DD", or "" before one is chosen. */
  start_date: string;
  /** "YYYY-MM-DD", or "" for none. */
  end_date: string;
  is_current: boolean;
  /** One bullet per line. */
  bullets: string;
}
