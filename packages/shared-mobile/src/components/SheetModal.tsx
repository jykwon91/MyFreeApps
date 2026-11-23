import { useEffect, useRef } from "react";
import { Modal, Platform, View } from "react-native";
import { SHEET_MODAL_ROOT_TEST_ID } from "../constants/sheetModal";
import { useMotion } from "../hooks/useMotion";
import { useTheme } from "../theme/useTheme";
import type { SheetModalProps } from "../types/SheetModalProps";

/**
 * The page sheet every sheet slides up in, still with Reduce Motion on. Back, the system's dismiss and the screen
 * reader's escape gesture all close it the one way, through onRequestClose.
 */
export default function SheetModal({ isOpen, onRequestClose, onClosed, testID, children }: SheetModalProps) {
  const { colors } = useTheme();
  const { sheetAnimation } = useMotion();
  const wasOpen = useRef(isOpen);

  // Only iOS tells a Modal it has finished closing. Android has nothing to wait for.
  useEffect(() => {
    if (Platform.OS !== "ios" && wasOpen.current && !isOpen) onClosed?.();
    wasOpen.current = isOpen;
  }, [isOpen, onClosed]);

  return (
    <Modal
      animationType={sheetAnimation}
      onDismiss={Platform.OS === "ios" ? onClosed : undefined}
      onRequestClose={onRequestClose}
      presentationStyle="pageSheet"
      testID={testID}
      visible={isOpen}
    >
      <View onAccessibilityEscape={onRequestClose} style={{ flex: 1, backgroundColor: colors.background }} testID={SHEET_MODAL_ROOT_TEST_ID}>
        {children}
      </View>
    </Modal>
  );
}
