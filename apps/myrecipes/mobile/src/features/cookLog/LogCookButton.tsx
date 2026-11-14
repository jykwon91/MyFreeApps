import { COOK_LOG_MESSAGES as SHARED } from "@myrecipes/api-client/constants/cookLog";
import { LoadingButton } from "@platform/mobile";
import { useState } from "react";
import { COOK_LOG_PHONE_MESSAGES as MESSAGES } from "../../constants/cookLog";
import type { LogCookButtonProps } from "../../types/LogCookButtonProps";
import LogCookSheet from "./LogCookSheet";

/** The website's "I made it": opens the sheet that logs a cook of the version on screen. */
export default function LogCookButton({ recipeId, versionId, versionNumber }: LogCookButtonProps) {
  const [isLogging, setIsLogging] = useState(false);

  return (
    <>
      <LoadingButton accessibilityHint={MESSAGES.madeItHint} onPress={() => setIsLogging(true)} variant="secondary">
        {SHARED.madeIt}
      </LoadingButton>
      {isLogging ? (
        <LogCookSheet
          onClose={() => setIsLogging(false)}
          recipeId={recipeId}
          versionId={versionId}
          versionNumber={versionNumber}
        />
      ) : null}
    </>
  );
}
