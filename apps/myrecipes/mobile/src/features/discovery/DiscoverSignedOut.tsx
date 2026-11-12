import { EmptyState } from "@platform/mobile";
import { useRouter } from "expo-router";
import { DISCOVERY_SIGNED_OUT } from "../../constants/discovery";

export default function DiscoverSignedOut() {
  const router = useRouter();

  return (
    <EmptyState
      action={{ label: "Sign in", onPress: () => router.push("/sign-in") }}
      body={DISCOVERY_SIGNED_OUT.body}
      heading={DISCOVERY_SIGNED_OUT.heading}
    />
  );
}
