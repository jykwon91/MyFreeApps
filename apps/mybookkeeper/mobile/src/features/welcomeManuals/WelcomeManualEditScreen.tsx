import WelcomeManualFormScreen from "./WelcomeManualFormScreen";
import WelcomeManualLoader from "./WelcomeManualLoader";

export default function WelcomeManualEditScreen({ id }: { id: string }) {
  return <WelcomeManualLoader id={id} requireWrite>{({ manual }) => <WelcomeManualFormScreen key={manual.id} original={manual} />}</WelcomeManualLoader>;
}
