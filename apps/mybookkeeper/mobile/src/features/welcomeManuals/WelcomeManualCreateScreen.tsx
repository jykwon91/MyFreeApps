import RequireWrite from "../workspace/RequireWrite";
import WelcomeManualDetailSkeleton from "./WelcomeManualDetailSkeleton";
import WelcomeManualFormScreen from "./WelcomeManualFormScreen";

export default function WelcomeManualCreateScreen() {
  return (
    <RequireWrite loading={<WelcomeManualDetailSkeleton />}>
      <WelcomeManualFormScreen original={null} />
    </RequireWrite>
  );
}
