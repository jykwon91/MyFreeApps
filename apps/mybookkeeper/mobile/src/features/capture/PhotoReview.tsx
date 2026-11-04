import { LoadingButton, useTheme } from "@platform/mobile";
import { Image, View } from "react-native";

interface PhotoReviewProps {
  uri: string;
  onRetake: () => void;
  onUse: () => Promise<void>;
}

export default function PhotoReview({ uri, onRetake, onUse }: PhotoReviewProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ flex: 1, gap: spacing.md, padding: spacing.lg }}>
      <Image accessibilityLabel="The photo you just took" resizeMode="contain" source={{ uri }} style={{ flex: 1 }} />
      <LoadingButton loadingText="Saving…" onPress={onUse}>
        Use photo
      </LoadingButton>
      <LoadingButton onPress={onRetake} variant="secondary">
        Retake
      </LoadingButton>
    </View>
  );
}
