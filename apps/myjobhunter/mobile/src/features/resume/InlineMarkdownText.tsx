import { inlineSpans } from "@myjobhunter/api-client/utils/inlineSpans";
import { Text } from "react-native";
import type { InlineMarkdownTextProps } from "../../types/InlineMarkdownTextProps";

/** A line of the draft with its **bold** and *italic* drawn, as the website's preview does. */
export default function InlineMarkdownText({ source, style }: InlineMarkdownTextProps) {
  return (
    <Text style={style}>
      {inlineSpans(source).map((span, index) => (
        <Text key={index} style={{ fontWeight: span.bold ? "700" : undefined, fontStyle: span.italic ? "italic" : undefined }}>
          {span.text}
        </Text>
      ))}
    </Text>
  );
}
