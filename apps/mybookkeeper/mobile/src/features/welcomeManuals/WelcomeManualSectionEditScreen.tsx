import WelcomeManualSectionFormScreen from "./WelcomeManualSectionFormScreen";
import WelcomeManualSectionGate from "./WelcomeManualSectionGate";

interface WelcomeManualSectionEditScreenProps {
  manualId: string;
  sectionId: string;
}

export default function WelcomeManualSectionEditScreen({ manualId, sectionId }: WelcomeManualSectionEditScreenProps) {
  return (
    <WelcomeManualSectionGate manualId={manualId} requireWrite sectionId={sectionId}>
      {({ manual }, section) => <WelcomeManualSectionFormScreen key={section.id} manual={manual} original={section} />}
    </WelcomeManualSectionGate>
  );
}
