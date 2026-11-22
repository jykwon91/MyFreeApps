import { decode } from "html-entities";
import { safeLinkUrl } from "@platform/core/utils/safeLinkUrl";
import type { ReactNode } from "react";
import { Text, type TextStyle } from "react-native";
import { Renderer } from "react-native-marked";
import { MARKDOWN_LINK_SCHEMES } from "../../constants/markdown";

/**
 * Draws only what the website's Markdown renderer draws. Images are left out, as they are there;
 * a link opens through the app's opener, and only with an allowed scheme — any other stays plain text.
 */
export default class MarkdownRenderer extends Renderer {
  private readonly openLink: (url: string) => void;
  private readonly linkHint: string;
  private readonly plainLinkStyle: TextStyle;

  constructor(openLink: (url: string) => void, linkHint: string, plainLinkStyle: TextStyle) {
    // Not selectable, as the plain text it replaces wasn't: selectable text can swallow link taps on iOS.
    super({ selectable: false });
    this.openLink = openLink;
    this.linkHint = linkHint;
    this.plainLinkStyle = plainLinkStyle;
  }

  override heading(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <Text accessibilityRole="header" key={this.getKey()} style={styles}>
        {text}
      </Text>
    );
  }

  override link(children: string | ReactNode[], href: string, styles?: TextStyle): ReactNode {
    const url = safeLinkUrl(href, MARKDOWN_LINK_SCHEMES);
    if (!url) {
      return (
        <Text key={this.getKey()} style={[styles, this.plainLinkStyle]}>
          {children}
        </Text>
      );
    }
    return (
      <Text accessibilityHint={this.linkHint} accessibilityRole="link" key={this.getKey()} onPress={() => this.openLink(url)} style={styles}>
        {children}
      </Text>
    );
  }

  /** The library passes text undecoded; decode entities such as &amp;amp; as the website does. */
  override text(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return super.text(typeof text === "string" ? decode(text) : text, styles);
  }

  override image(): ReactNode {
    return null;
  }

  override linkImage(): ReactNode {
    return null;
  }
}
