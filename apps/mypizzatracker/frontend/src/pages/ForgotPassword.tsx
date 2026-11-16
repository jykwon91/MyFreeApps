import { ForgotPasswordPage } from "@platform/ui";
import { Gamepad2 } from "lucide-react";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPassword() {
  return (
    <ForgotPasswordPage
      onRequestReset={forgotPassword}
      icon={<Gamepad2 className="size-6 text-primary" />}
    />
  );
}
