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
export { formatFileSize } from "./utils/file-size";
export { formatSalaryRange, SALARY_PERIOD_LABELS } from "./utils/salary-range";
export { formatTag } from "./utils/tag";
export { extractErrorMessage } from "./utils/errorMessage";
export { showError, showSuccess, subscribe } from "./lib/toast-store";
export type { ToastEvent, ToastVariant } from "./lib/toast-store";
export { notifyAuthChange, useIsAuthenticated } from "./lib/auth-store";
export { baseApi } from "./store/baseApi";
export { axiosBaseQuery } from "./store/baseQuery";

// UI components
export { default as EmptyState } from "./components/ui/EmptyState";
export { default as AlertBox } from "./components/ui/AlertBox";
export { default as Button } from "./components/ui/Button";
export { default as LoadingButton } from "./components/ui/LoadingButton";
export { default as Skeleton } from "./components/ui/Skeleton";
export { default as Select } from "./components/ui/Select";
export { default as Badge } from "./components/ui/Badge";
export { default as Card } from "./components/ui/Card";
export { default as FormField } from "./components/ui/FormField";
export { default as Toaster } from "./components/ui/Toaster";
export { default as TurnstileWidget } from "./components/ui/TurnstileWidget";

// Layout components
export { default as AppShell } from "./components/layout/AppShell";
export type { AppShellProps, NavItem, BottomNavItem } from "./components/layout/AppShell";

// Auth components
export { default as RequireAuth } from "./components/auth/RequireAuth";
export { default as LoginForm } from "./components/auth/LoginForm";
export type { LoginFormProps } from "./components/auth/LoginForm";
export { default as PasswordPair } from "./components/auth/PasswordPair";
export type { PasswordPairProps } from "./components/auth/PasswordPair";

// Data components
export { default as DataTable } from "./components/data/DataTable";
export type { DataTableProps, ColumnDef, SortingState, PaginationState } from "./components/data/DataTable";
export { default as Pagination } from "./components/data/Pagination";
export type { PaginationProps } from "./components/data/Pagination";

// Upload components
export { default as FileUploadDropzone } from "./components/upload/FileUploadDropzone";
export type { FileUploadDropzoneProps } from "./components/upload/FileUploadDropzone";

// Hooks
export { useMediaQuery } from "./hooks/useMediaQuery";
export { useTheme } from "./hooks/useTheme";
export { useToast } from "./hooks/useToast";
