import type { WelcomeManualLoaderProps } from "../../types/WelcomeManualLoaderProps";
import RequireWrite from "../workspace/RequireWrite";
import WelcomeManualContent from "./WelcomeManualContent";
import WelcomeManualDetailSkeleton from "./WelcomeManualDetailSkeleton";

/** Opens one manual for a screen. With requireWrite, a viewer is told they can't and the manual isn't fetched. */
export default function WelcomeManualLoader({ requireWrite = false, ...content }: WelcomeManualLoaderProps) {
  return (
    <RequireWrite loading={<WelcomeManualDetailSkeleton />} required={requireWrite}>
      <WelcomeManualContent {...content} />
    </RequireWrite>
  );
}
