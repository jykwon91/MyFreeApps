/** The query string of a bank CSV import: only the choices actually made, so none is sent as blank. */
export function bankCsvImportParams(
  propertyId?: string,
  accountId?: string,
  transactionScope?: string,
  spendingCategoryId?: string,
): Record<string, string> | undefined {
  const params: Record<string, string> = {};
  if (propertyId) params.property_id = propertyId;
  if (accountId) params.account_id = accountId;
  if (transactionScope && transactionScope !== "rental") params.transaction_scope = transactionScope;
  if (spendingCategoryId) params.spending_category_id = spendingCategoryId;
  return Object.keys(params).length > 0 ? params : undefined;
}
