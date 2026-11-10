import type { LeaseTemplateIdProps } from "../../types/LeaseTemplateIdProps";
import { useCanWrite } from "../workspace/useCanWrite";
import LeaseTemplateGate from "./LeaseTemplateGate";
import PlaceholdersBody from "./PlaceholdersBody";

export default function LeaseTemplatePlaceholdersScreen({ id }: LeaseTemplateIdProps) {
  const canWrite = useCanWrite();
  return <LeaseTemplateGate id={id}>{(template) => <PlaceholdersBody canWrite={canWrite} template={template} />}</LeaseTemplateGate>;
}
