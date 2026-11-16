import { useFieldErrorAnnouncement, useTheme } from "@platform/mobile";
import { Text } from "react-native";

/**
 * A problem with a whole list, e.g. no ingredients, shown under its heading. It is read with the
 * form's field errors, so a save that finds several problems reads them as one summary.
 */
export default function SectionProblem({ section, message }: { section: string; message: string | undefined }) {
  const { colors, fontSize } = useTheme();
  useFieldErrorAnnouncement(section, message);
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={{ color: colors.destructiveText, fontSize: fontSize.xs }}>
      {message}
    </Text>
  );
}
