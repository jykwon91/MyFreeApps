import { FieldError } from "@platform/mobile";

/**
 * A problem with a whole list, e.g. no ingredients, shown under its heading. It is read with the
 * form's field errors, so a save that finds several problems reads them as one summary.
 */
export default function SectionProblem({ section, message }: { section: string; message: string | undefined }) {
  return <FieldError message={message} name={section} size="xs" />;
}
