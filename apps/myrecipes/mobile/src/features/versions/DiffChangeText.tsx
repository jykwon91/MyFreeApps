import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { DiffChangeTextProps } from "../../types/DiffChangeTextProps";

/** A change's text: old → new (with its label) for a change, the old text struck through for a removal, else the new text. */
export default function DiffChangeText({ line, text, struck }: DiffChangeTextProps) {
  const { spacing } = useTheme();
  if (line.change === "changed") {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: spacing.sm }}>
        {line.label ? <Text style={{ ...text, fontWeight: "600" }}>{line.label}:</Text> : null}
        <Text style={struck}>{line.before}</Text>
        <Text style={text}>→</Text>
        <Text style={{ ...text, fontWeight: "600" }}>{line.after}</Text>
      </View>
    );
  }
  if (line.change === "removed") return <Text style={struck}>{line.before}</Text>;
  return <Text style={{ ...text, fontWeight: "600" }}>{line.after}</Text>;
}
