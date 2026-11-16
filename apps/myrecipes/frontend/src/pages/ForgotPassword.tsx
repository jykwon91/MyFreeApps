import { ForgotPasswordPage } from "@platform/ui";
import { ChefHat } from "lucide-react";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPassword() {
  return (
    <ForgotPasswordPage
      onRequestReset={forgotPassword}
      icon={<ChefHat className="size-6 text-primary" />}
    />
  );
}
