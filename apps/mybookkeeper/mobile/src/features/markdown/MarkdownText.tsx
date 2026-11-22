import { LINK_MESSAGES, useOpenLink, useTheme } from "@platform/mobile";
import { useMemo } from "react";
import { View } from "react-native";
import { useMarkdown } from "react-native-marked";
import type { MarkdownTextProps } from "../../types/MarkdownTextProps";
import MarkdownRenderer from "./MarkdownRenderer";
import { markdownStyles } from "./markdownStyles";

/** A host's Markdown drawn as the website draws it: headings, lists, emphasis, tables and links that open in the browser. */
export default function MarkdownText({ source }: MarkdownTextProps) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const styles = useMemo(() => markdownStyles(colors, spacing, fontSize), [colors, spacing, fontSize]);
  const renderer = useMemo(
    () => new MarkdownRenderer((url) => void openLink(url), LINK_MESSAGES.opensBrowser, { color: colors.foreground, textDecorationLine: "none" }),
    [openLink, colors.foreground],
  );
  const elements = useMarkdown(source, { renderer, styles });
  return <View style={{ gap: spacing.sm }}>{elements}</View>;
}
