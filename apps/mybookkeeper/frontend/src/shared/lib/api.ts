import { exemptFromSignOut } from "@platform/ui";
import api from "@platform/ui/lib/api";

// `/integrations/gmail/sync`: a revoked Gmail token, which the user fixes by reconnecting.
// `/public/welcome-manuals`: the guest PIN gate. A host previewing their own share link
// while signed in would otherwise be signed out by a mistyped PIN.
exemptFromSignOut(["/integrations/gmail/sync", "/public/welcome-manuals"]);

export default api;
