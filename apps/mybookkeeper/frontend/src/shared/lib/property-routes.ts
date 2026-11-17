/** Search param on /properties that opens one property's edit card. */
export const PROPERTY_EDIT_PARAM = "edit";

export function propertyEditPath(propertyId: string): string {
  return `/properties?${PROPERTY_EDIT_PARAM}=${encodeURIComponent(propertyId)}`;
}
