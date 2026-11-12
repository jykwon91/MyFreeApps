import { useAnnouncement, useTheme } from "@platform/mobile";
import { Text } from "react-native";

/** A problem with a whole list, e.g. no ingredients, shown under its heading and announced. */
export default function SectionProblem({ message }: { message: string | undefined }) {
  const { colors, fontSize } = useTheme();
  useAnnouncement(message);
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={{ color: colors.destructiveText, fontSize: fontSize.xs }}>
      {message}
    </Text>
  );
}
