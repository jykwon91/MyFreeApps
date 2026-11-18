import type { ImageSourcePropType, ImageURISource } from "react-native";

/** The address of a remote image source, or undefined for a local asset, several sources or none. */
export function remoteUri(source: ImageSourcePropType | undefined): string | undefined {
  if (!source || typeof source === "number" || Array.isArray(source)) return undefined;
  return (source as ImageURISource).uri;
}
