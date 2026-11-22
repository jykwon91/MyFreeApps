import { FIELD_ERROR_NAME_PREFIX } from "../src/constants/formField";

const escapeForRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches a field's spoken name whether or not it has an error: "Email" or "Email, error: ...". Pass the name as it reads without an error. */
export const fieldLabel = (name: string): RegExp => new RegExp(`^${escapeForRegExp(name)}(, ${FIELD_ERROR_NAME_PREFIX}.*)?$`);
