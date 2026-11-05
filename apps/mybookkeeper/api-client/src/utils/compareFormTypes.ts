import { FORM_TYPE_ORDER } from "../constants/taxForms";

/** Tax-form order, with forms the list doesn't know last and alphabetical. */
export function compareFormTypes(a: string, b: string): number {
  const ai = FORM_TYPE_ORDER.indexOf(a);
  const bi = FORM_TYPE_ORDER.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}
