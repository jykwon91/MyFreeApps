import { Image } from "react-native";
import type { ThumbnailProps } from "../types/ThumbnailProps";

/**
 * A photo shown in a small box. Without `resizeMethod="resize"` Android decodes the whole file
 * (about 48 MB for a 12 MP camera photo) to fill a box a few dozen pixels wide; with it the
 * picture is downsampled to the size of the view, so several photos don't exhaust memory.
 * Use it for every small local or remote photo; full-size viewers keep a plain Image.
 */
export default function Thumbnail(props: ThumbnailProps) {
  // iOS only makes an Image an accessibility element when told to, so a bare label is never read.
  const isLabelled = Boolean(props.accessibilityLabel ?? props.alt);
  return <Image accessible={isLabelled} accessibilityRole={isLabelled ? "image" : undefined} {...props} resizeMethod="resize" />;
}
