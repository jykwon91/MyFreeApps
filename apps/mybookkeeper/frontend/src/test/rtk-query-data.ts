/**
 * The data fields of a loaded RTK Query hook result. RTK sets both: ``data``
 * keeps the last answer across argument changes, ``currentData`` only holds
 * the answer for the current arguments. Pages that must not show another
 * record's data read ``currentData``, so mocks have to provide it too.
 */
export function queryData<T>(record: T): { data: T; currentData: T } {
  return { data: record, currentData: record };
}
