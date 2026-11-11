import { parseBoldSegments } from "@platform/core/utils/parseBoldSegments";
import { Text } from "react-native";
import type { BoldTextProps } from "../../types/BoldTextProps";

/** A line with its **bold** runs drawn bold, as the website's InlineBoldText draws them. */
export default function BoldText({ text, style }: BoldTextProps) {
  return (
    <Text style={style}>
      {parseBoldSegments(text).map((segment, index) =>
        segment.bold ? (
          // The segments never reorder, so their places are their keys.
          <Text key={index} style={{ fontWeight: "700" }}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        ),
      )}
    </Text>
  );
}
