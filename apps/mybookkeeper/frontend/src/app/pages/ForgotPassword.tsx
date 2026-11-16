import { ForgotPasswordPage } from "@platform/ui";
import { forgotPassword } from "@/shared/lib/auth";

export default function ForgotPassword() {
  return <ForgotPasswordPage onRequestReset={forgotPassword} heading="MyBookkeeper" />;
}
