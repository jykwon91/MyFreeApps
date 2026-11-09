/** What the import form holds. A blank string is "not given", and the files are counted by the screen that holds them. */
export interface LeaseImportFormValues {
  applicantId: string;
  listingId: string;
  startsOn: string;
  endsOn: string;
  notes: string;
}
