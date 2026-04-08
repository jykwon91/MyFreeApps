// @platform/ui — shared frontend components, hooks, and utilities
//
// Import from subpaths:
//   import Button from "@platform/ui/components/ui/Button"
//   import { cn } from "@platform/ui/utils/cn"
//   import { useTheme } from "@platform/ui/hooks/useTheme"
//   import api from "@platform/ui/lib/api"
//   import { baseApi } from "@platform/ui/store/baseApi"

// Re-export key utilities for convenience
export { cn } from "./utils/cn";
export { formatCurrency } from "./utils/currency";
export { formatDate, timeAgo } from "./utils/date";
export { formatTag } from "./utils/tag";
export { getErrorMessage } from "./utils/errorMessage";
export { showError, showSuccess, subscribe } from "./lib/toast-store";
export type { ToastEvent, ToastVariant } from "./lib/toast-store";
export { notifyAuthChange, useIsAuthenticated } from "./lib/auth-store";
export { baseApi } from "./store/baseApi";
export { axiosBaseQuery } from "./store/baseQuery";
