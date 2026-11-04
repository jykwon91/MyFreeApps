// @platform/mobile — React Native components shared by every app's mobile code.
//
// Logic that web also needs belongs in @platform/core, not here.

export { createMobileSession } from "./auth/createMobileSession";
export { onAccountLeft } from "./auth/onAccountLeft";
export { resetCacheOnAccountChange } from "./auth/resetCacheOnAccountChange";
export { assertSecureApiUrl } from "./utils/assertSecureApiUrl";

export { default as AccountSection } from "./components/AccountSection";
export { default as Banner } from "./components/Banner";
export { default as EmptyState } from "./components/EmptyState";
export { default as FormField } from "./components/FormField";
export { default as LoadingButton } from "./components/LoadingButton";
export { default as SearchField } from "./components/SearchField";
export { default as SegmentedControl } from "./components/SegmentedControl";
export { default as SessionEndedBanner } from "./components/SessionEndedBanner";
export { default as RequiredSignInScreen } from "./components/RequiredSignInScreen";
export { default as SessionPendingScreen } from "./components/SessionPendingScreen";
export { default as SessionProvider } from "./components/SessionProvider";
export { default as SignInScreen } from "./components/SignInScreen";
export { default as Skeleton } from "./components/Skeleton";
export { default as Toast } from "./components/Toast";
export { default as UnreadableSession } from "./components/UnreadableSession";
export { default as WebLink } from "./components/WebLink";

export { useAnnouncement } from "./hooks/useAnnouncement";
export { useRefresh } from "./hooks/useRefresh";
export { useDevices } from "./hooks/useDevices";
export { useReduceMotion } from "./hooks/useReduceMotion";
export { useScreenReaderEnabled } from "./hooks/useScreenReaderEnabled";
export { useSession } from "./hooks/useSession";

export { darkColors, lightColors } from "./theme/colors";
export { radius } from "./theme/radius";
export { spacing } from "./theme/spacing";
export { MIN_TOUCH_TARGET } from "./theme/touchTarget";
export { fontSize } from "./theme/typography";
export { useTheme } from "./theme/useTheme";

export type { AccountMessage } from "./types/AccountMessage";
export type { ButtonVariant } from "./types/ButtonVariant";
export type { EmptyStateAction } from "./types/EmptyStateAction";
export type { EmptyStateProps } from "./types/EmptyStateProps";
export type { FormFieldProps } from "./types/FormFieldProps";
export type { LoadingButtonProps } from "./types/LoadingButtonProps";
export type { SearchFieldProps } from "./types/SearchFieldProps";
export type { SegmentedControlProps } from "./types/SegmentedControlProps";
export type { SkeletonProps } from "./types/SkeletonProps";
export type { MobileSession } from "./types/MobileSession";
export type { SessionState } from "./types/SessionState";
export type { Theme } from "./types/Theme";
export type { ThemeColors } from "./types/ThemeColors";
export type { ToastProps } from "./types/ToastProps";
export type { ToastVariant } from "./types/ToastVariant";
