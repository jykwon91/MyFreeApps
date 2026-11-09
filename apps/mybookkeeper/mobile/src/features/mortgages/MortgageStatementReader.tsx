import type { MortgageDraft } from "@mybookkeeper/api-client/types/mortgage/mortgage-draft";
import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  MORTGAGE_STATEMENT_FILE_TYPES,
  MORTGAGE_STATEMENT_MESSAGES as MESSAGES,
  MORTGAGE_STATEMENT_PHOTO_NAME,
} from "../../constants/mortgageForm";
import HeldFileButtons from "../uploads/HeldFileButtons";
import MortgageLibrarySheet from "./MortgageLibrarySheet";
import { useReadStatement } from "./useReadStatement";

interface MortgageStatementReaderProps {
  onRead: (draft: MortgageDraft) => void;
  /** True while the loan itself is being saved. */
  isDisabled: boolean;
}

/**
 * Fill the form from a statement: a photo, a file, or a document already uploaded. A monthly
 * statement is the paper that exists for every loan, and its balance and payment split are the
 * fields the comparison needs to be current.
 */
export default function MortgageStatementReader({ onRead, isDisabled }: MortgageStatementReaderProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const reader = useReadStatement(onRead);
  const [isPickingLibrary, setIsPickingLibrary] = useState(false);
  const isBlocked = isDisabled || reader.isReading;

  return (
    <View style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.title}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.hint}</Text>
      {reader.failure ? <Banner message={reader.failure} /> : null}
      {reader.readName && !reader.failure ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{MESSAGES.readDone(reader.readName)}</Text>
      ) : null}
      <HeldFileButtons
        file={reader.file}
        fileTypes={MORTGAGE_STATEMENT_FILE_TYPES}
        isDisabled={isBlocked}
        isPicking={reader.isPicking}
        onPick={(from) => void reader.chooseAndRead(from)}
        photoName={MORTGAGE_STATEMENT_PHOTO_NAME}
        takePhotoLabel={MESSAGES.takePhoto}
      />
      <LoadingButton disabled={isBlocked || reader.isPicking} onPress={() => setIsPickingLibrary(true)} variant="secondary">
        {MESSAGES.fromLibrary}
      </LoadingButton>
      {reader.file && reader.failure ? (
        <>
          <LoadingButton isLoading={reader.isReading} loadingText={MESSAGES.reading} onPress={() => void reader.retry()}>
            {MESSAGES.tryAgain}
          </LoadingButton>
          <LoadingButton disabled={reader.isReading} onPress={reader.forget} variant="ghost">
            {MESSAGES.neverMind}
          </LoadingButton>
        </>
      ) : null}
      {reader.isReading ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.reading}</Text>
        </View>
      ) : null}
      <MortgageLibrarySheet
        isOpen={isPickingLibrary}
        onClose={() => setIsPickingLibrary(false)}
        onPick={(documentId, name) => {
          setIsPickingLibrary(false);
          void reader.readLibrary(documentId, name);
        }}
      />
    </View>
  );
}
