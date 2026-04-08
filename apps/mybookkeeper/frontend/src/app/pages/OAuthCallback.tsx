import { useEffect } from "react";

export default function OAuthCallback() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: "gmail_connected" }, window.location.origin);
      window.close();
    }
  }, []);

  return (
    <div className="p-8 text-center text-muted-foreground text-sm">
      Connecting… this window will close automatically.
    </div>
  );
}
