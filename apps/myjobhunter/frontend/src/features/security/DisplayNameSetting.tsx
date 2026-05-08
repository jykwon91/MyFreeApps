import { useGetCurrentUserQuery } from "@/lib/userApi";
import DisplayNameForm from "@/features/security/DisplayNameForm";

/**
 * Lets the user set the display name shown in their profile and on exported
 * data. Without this, the app falls back to the email local-part.
 */
export default function DisplayNameSetting() {
  const { data: currentUser, isLoading } = useGetCurrentUserQuery();

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">Display name</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Shown in your profile and on exported data. Use the name you want
          employers and contacts to see.
        </p>
      </div>
      <DisplayNameForm
        key={currentUser?.id ?? "loading"}
        initialName={currentUser?.display_name ?? ""}
        disabled={isLoading}
      />
    </div>
  );
}
