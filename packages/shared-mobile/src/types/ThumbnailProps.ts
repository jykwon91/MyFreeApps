import type { ImageProps } from "react-native";

/** Everything an Image takes, except how it is resized: a thumbnail always downsamples. */
export type ThumbnailProps = Omit<ImageProps, "resizeMethod">;
