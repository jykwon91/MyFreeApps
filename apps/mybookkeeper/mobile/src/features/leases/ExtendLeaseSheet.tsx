import { useExtendSignedLeaseMutation, useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { Banner, FormField, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, type ScrollViewInstance, Text } from "react-native";
import { alreadyEnds, extendContext, extendedTo, EXTENSION_NOTE_MAX_LENGTH, LEASE_MESSAGES, pickDateAfter } from "../../constants/leases";
import DatePicker from "../shell/DatePicker";
import { confirmDiscard } from "../uploads/confirmDiscard";
import { httpStatus } from "../transactions/transactionMessages";
import { extendLeaseFailure } from "./extendLeaseFailure";

interface ExtendLeaseSheetProps {
  leaseId: string;
  endsOn: string;
  onClose: () => void;
}

export default function ExtendLeaseSheet({ leaseId, endsOn, onClose }: ExtendLeaseSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [extendLease] = useExtendSignedLeaseMutation();
  const { refetch } = useGetSignedLeaseByIdQuery(leaseId);
  // Stays null until something's picked: an addendum is a legal record, so no date is assumed.
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isSubmitting = useRef(false);
  const scroller = useRef<ScrollViewInstance>(null);
  const isLater = picked !== null && picked > endsOn;

  // The buttons sit below the calendar and note, so a message at the top would be off screen.
  useEffect(() => {
    if (failure) scroller.current?.scrollTo({ y: 0 });
  }, [failure]);

  function close(): void {
    if (isBusy) return;
    if (picked || note.trim()) confirmDiscard(onClose);
    else onClose();
  }

  function finish(newEndsOn: string): void {
    onClose();
    showToast(extendedTo(formatLongDate(newEndsOn)));
  }

  /** The server commits before it answers, so a failed answer doesn't mean nothing happened. */
  async function checkWhatHappened(newEndsOn: string, answered: boolean): Promise<void> {
    const latest = await refetch();
    if (latest.isError || !latest.data) {
      setFailure(LEASE_MESSAGES.extendUnsure);
    } else if (latest.data.ends_on === newEndsOn) {
      finish(newEndsOn);
    } else if (latest.data.ends_on && latest.data.ends_on > endsOn) {
      setFailure(alreadyEnds(formatLongDate(latest.data.ends_on)));
    } else {
      // With no answer at all, the server could still be working on it.
      setFailure(answered ? LEASE_MESSAGES.extendFailedNothingChanged : LEASE_MESSAGES.extendNotSeen);
    }
  }

  async function submit(): Promise<void> {
    if (!isLater || isSubmitting.current) return;
    isSubmitting.current = true;
    setIsBusy(true);
    setFailure(null);
    try {
      await extendLease({ leaseId, data: { new_ends_on: picked, notes: note.trim() || undefined, email_tenant: false } }).unwrap();
      finish(picked);
    } catch (error) {
      const known = extendLeaseFailure(error);
      if (known) setFailure(known);
      else await checkWhatHappened(picked, httpStatus(error) !== undefined);
    } finally {
      isSubmitting.current = false;
      setIsBusy(false);
    }
  }

  const longEnd = formatLongDate(endsOn);
  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ref={scroller}
        >
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {LEASE_MESSAGES.extend}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{extendContext(longEnd)}</Text>
          {failure ? <Banner message={failure} /> : null}

          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{LEASE_MESSAGES.newEndDate}</Text>
          <DatePicker
            label={LEASE_MESSAGES.newEndDate}
            minimum={endsOn}
            onChange={(date) => {
              if (!isBusy) setPicked(date);
            }}
            value={picked && picked > endsOn ? picked : endsOn}
          />
          {picked !== null && !isLater ? <Text style={{ fontSize: fontSize.sm, color: colors.destructive }}>{pickDateAfter(longEnd)}</Text> : null}

          <FormField
            editable={!isBusy}
            hint={LEASE_MESSAGES.extensionNoteHint}
            inputStyle={{ minHeight: 96, textAlignVertical: "top" }}
            label={LEASE_MESSAGES.extensionNote}
            maxLength={EXTENSION_NOTE_MAX_LENGTH}
            multiline
            onChangeText={setNote}
            value={note}
          />

          <LoadingButton disabled={!isLater} isLoading={isBusy} loadingText={LEASE_MESSAGES.extending} onPress={() => void submit()}>
            {LEASE_MESSAGES.extend}
          </LoadingButton>
          <LoadingButton disabled={isBusy} onPress={close} variant="ghost">
            {LEASE_MESSAGES.cancel}
          </LoadingButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
