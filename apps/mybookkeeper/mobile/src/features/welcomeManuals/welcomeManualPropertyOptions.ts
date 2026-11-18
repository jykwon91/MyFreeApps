import type { SheetOption } from "@platform/mobile";
import { WELCOME_MANUAL_FORM_MESSAGES } from "../../constants/welcomeManualForms";

/** The choice for "no property"; an option's value can't be empty. */
export const NO_PROPERTY_VALUE = "none";

/** Nothing until the properties are here: "No property" alone would read as "you have none", and picking it would drop the one the manual has. */
export function propertyOptions(properties: readonly { id: string; name: string }[] | undefined): SheetOption<string>[] {
  if (!properties) return [];
  return [
    { value: NO_PROPERTY_VALUE, label: WELCOME_MANUAL_FORM_MESSAGES.noProperty },
    ...properties.map((property) => ({ value: property.id, label: property.name })),
  ];
}
