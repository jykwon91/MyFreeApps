import { useLeaveWhenSaved } from "@platform/mobile";
import WelcomeManualDetailBody from "./WelcomeManualDetailBody";
import WelcomeManualLoader from "./WelcomeManualLoader";

export default function WelcomeManualDetailScreen({ id }: { id: string }) {
  const { isLeaving, leave } = useLeaveWhenSaved("/welcome-manuals");
  return (
    <WelcomeManualLoader id={id} isLeaving={isLeaving}>
      {({ manual, refreshControl }) => <WelcomeManualDetailBody manual={manual} onDeleted={leave} refreshControl={refreshControl} />}
    </WelcomeManualLoader>
  );
}
