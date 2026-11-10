import { useLeaveWhenSaved } from "@platform/mobile";
import WelcomeManualSectionDetailBody from "./WelcomeManualSectionDetailBody";
import WelcomeManualSectionGate from "./WelcomeManualSectionGate";

interface WelcomeManualSectionDetailScreenProps {
  manualId: string;
  sectionId: string;
}

export default function WelcomeManualSectionDetailScreen({ manualId, sectionId }: WelcomeManualSectionDetailScreenProps) {
  const { isLeaving, leave } = useLeaveWhenSaved(`/welcome-manuals/${manualId}/sections`);
  return (
    <WelcomeManualSectionGate isLeaving={isLeaving} manualId={manualId} sectionId={sectionId}>
      {(view, section) => <WelcomeManualSectionDetailBody onDeleted={leave} section={section} view={view} />}
    </WelcomeManualSectionGate>
  );
}
