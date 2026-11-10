import { Banner, LoadingButton, useDiscardPrompt, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { BANK_CSV_FILE_TYPES, BANK_IMPORT_MESSAGES as MESSAGES } from "../../constants/bankImport";
import { NO_FILTERS } from "../../constants/transactionFilters";
import HeldFilesList from "../uploads/HeldFilesList";
import { chooseHeldFile } from "../uploads/pickHeldFile";
import { useHeldFiles } from "../uploads/useHeldFiles";
import { transactionsLink } from "../transactions/transactionFilters";
import { bankCsvProblem } from "./bankCsvProblem";
import BankImportPropertyField from "./BankImportPropertyField";
import BankImportResultView from "./BankImportResultView";
import { useImportBankCsv } from "./useImportBankCsv";

/** Brings a bank's CSV in from the phone: choose the file and a property, import, then go review what came in. */
export default function BankImportBody() {
  const { colors, spacing, fontSize } = useTheme();
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [pickFailure, setPickFailure] = useState<string | null>(null);
  const [hasTried, setHasTried] = useState(false);
  const held = useHeldFiles(setPickFailure, { replace: true });
  const { submit, isBusy, failure, result, reset, clearFailure } = useImportBankCsv();
  const file = held.files[0] ?? null;

  useDiscardPrompt(file !== null && result === null, isBusy);


  async function choose(): Promise<void> {
    clearFailure();
    const picked = await held.pick(() => chooseHeldFile(BANK_CSV_FILE_TYPES));
    if (!picked) return;
    const problem = bankCsvProblem(picked);
    if (problem) {
      held.drop(picked.uri);
      setPickFailure(problem);
    }
  }

  function importStatement(): void {
    setHasTried(true);
    if (file) void submit(file, propertyId);
  }

  function importAnother(): void {
    held.forgetAll();
    setHasTried(false);
    reset();
  }

  const locked = isBusy || held.isPicking;
  const banner = failure ?? pickFailure;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" testID="bank-import">
      {result ? (
        <BankImportResultView
          onImportAnother={importAnother}
          onViewTransactions={() => router.navigate(transactionsLink({ ...NO_FILTERS, view: "all" }))}
          result={result}
        />
      ) : (
        <>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.intro}</Text>
          {banner ? <Banner message={banner} /> : null}
          <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.file}
          </Text>
          <HeldFilesList emptyText={MESSAGES.noFile} files={held.files} isDisabled={isBusy} onRemove={held.drop} />
          {hasTried && !file ? (
            <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>
              {MESSAGES.needFile}
            </Text>
          ) : null}
          <LoadingButton disabled={isBusy} isLoading={held.isPicking} onPress={() => void choose()} variant="secondary">
            {file ? MESSAGES.chooseDifferentFile : MESSAGES.chooseFile}
          </LoadingButton>
          <BankImportPropertyField disabled={isBusy} onChange={setPropertyId} value={propertyId} />
          <LoadingButton disabled={locked} isLoading={isBusy} loadingText={MESSAGES.submitting} onPress={importStatement}>
            {MESSAGES.submit}
          </LoadingButton>
        </>
      )}
    </ScrollView>
  );
}
