/** The query string of a bank CSV import: only the choices actually made, so none is sent as blank. */
export function bankCsvImportParams(propertyId?: string, accountId?: string): Record<string, string> | undefined {
  const params: Record<string, string> = {};
  if (propertyId) params.property_id = propertyId;
  if (accountId) params.account_id = accountId;
  return Object.keys(params).length > 0 ? params : undefined;
}
