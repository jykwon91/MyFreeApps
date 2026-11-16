import { ForgotPasswordPage } from "@platform/ui";
import { Briefcase } from "lucide-react";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPassword() {
  return (
    <ForgotPasswordPage
      onRequestReset={forgotPassword}
      icon={<Briefcase className="size-6 text-primary" />}
    />
  );
}
