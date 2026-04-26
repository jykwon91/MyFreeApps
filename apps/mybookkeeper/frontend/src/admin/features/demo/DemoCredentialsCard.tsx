import type { DemoCredentials } from "@/shared/types/demo/demo-status";
import Card from "@/shared/components/ui/Card";
import CopyField from "@/shared/components/ui/CopyField";

interface Props {
  credentials: DemoCredentials;
}

export default function DemoCredentialsCard({ credentials }: Props) {
  return (
    <Card title="Demo Credentials">
      <div className="space-y-3">
        <CopyField label="Email" value={credentials.email} />
        <CopyField label="Password" value={credentials.password} />
      </div>
    </Card>
  );
}
