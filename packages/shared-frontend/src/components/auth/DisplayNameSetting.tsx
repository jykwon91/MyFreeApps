import { useGetCurrentUserQuery } from "../../store/userApi";
import DisplayNameForm from "./DisplayNameForm";
import type { DisplayNameSettingProps } from "../../types/display-name-setting-props";

const DEFAULT_DESCRIPTION = "Shown in your profile and on exported data.";

/**
 * Lets the user set the display name shown in their profile and on exported
 * data. Without this, the app falls back to the email local-part. Apps with
 * their own wording pass `description`.
 */
export default function DisplayNameSetting({ description = DEFAULT_DESCRIPTION }: DisplayNameSettingProps) {
  const { data: currentUser, isLoading } = useGetCurrentUserQuery();

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">Display name</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {description}
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
