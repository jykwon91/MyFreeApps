import { ForgotPasswordPage } from "@platform/ui";
import { Languages } from "lucide-react";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPassword() {
  return (
    <ForgotPasswordPage
      onRequestReset={forgotPassword}
      icon={<Languages className="size-6 text-primary" />}
    />
  );
}
