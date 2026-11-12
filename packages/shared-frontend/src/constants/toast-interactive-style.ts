import type { CSSProperties } from "react";

// Pass as `style` to every Radix Toast.Root (the shared Toaster's and any custom
// one, such as an action toast). A toast already showing when a modal opens is
// an older Radix layer than the modal, so Radix gives it an inline
// `pointer-events: none`; a click on it then falls through to the modal's
// backdrop and closes the modal instead of the toast. Toast.Root's own style
// wins over the layer's (Slot merges the child's style last), and clicks on a
// toast never dismiss the modal: the viewport is a DismissableLayer branch,
// which the modal's outside-click handling ignores.
export const TOAST_INTERACTIVE_STYLE: CSSProperties = { pointerEvents: "auto" };
