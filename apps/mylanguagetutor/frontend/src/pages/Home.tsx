import { Navigate } from "react-router-dom";
import ProfileGate from "@/features/onboarding/ProfileGate";

/**
 * Entry point: first-time learners go through onboarding (ProfileGate sends
 * them there); everyone else goes straight to their scenarios.
 */
export default function Home() {
  return (
    <div className="p-6 max-w-2xl">
      <ProfileGate>{() => <Navigate to="/scenarios" replace />}</ProfileGate>
    </div>
  );
}
