import { AlertBox } from "@platform/ui";
import OpenInBrowserButton from "@/components/discord/OpenInBrowserButton";

/**
 * The screenshot reader inside the Discord Activity: it needs Cloudflare's
 * quick human check, which can't run inside Discord (see
 * isScreenshotReaderBrowserOnly), so say so and offer both ways forward.
 */
export default function ScreenshotReaderOpenInBrowser() {
  return (
    <AlertBox variant="info">
      <div className="space-y-2">
        <p>
          Reading screenshots works in the browser — Discord can&apos;t show the quick human check it needs. Paste
          tooltip text copied from a website here instead, or open this page in your browser.
        </p>
        <OpenInBrowserButton />
      </div>
    </AlertBox>
  );
}
