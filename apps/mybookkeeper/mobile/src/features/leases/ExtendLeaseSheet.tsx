import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { useExtendSignedLeaseMutation, useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { Banner, FormField, LoadingButton, MIN_TOUCH_TARGET, useTheme, useToast } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, type ScrollViewInstance, Switch, Text, View } from "react-native";
import {
  alreadyEnds,
  emailAddendumLabel,
  extendAndEmailBody,
  extendAndEmailTitle,
  extendContext,
  extendedAndEmailing,
  extendedEmailUnknown,
  extendedTo,
  EXTENSION_NOTE_MAX_LENGTH,
  LEASE_MESSAGES,
  pickDateAfter,
} from "../../constants/leases";
import DatePicker from "../shell/DatePicker";
import { confirmDiscard } from "../uploads/confirmDiscard";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { extendLeaseFailure, isMissingTenantEmail } from "./extendLeaseFailure";

interface ExtendLeaseSheetProps {
  leaseId: string;
  applicantId: string;
  tenantName: string | null;
  endsOn: string;
  onClose: () => void;
}

export default function ExtendLeaseSheet({ leaseId, applicantId, tenantName, endsOn, onClose }: ExtendLeaseSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [extendLease] = useExtendSignedLeaseMutation();
  const { refetch } = useGetSignedLeaseByIdQuery(leaseId);
  const { currentData: applicant, refetch: refetchApplicant } = useGetApplicantByIdQuery(applicantId);
  // Stays null until something's picked: an addendum is a legal record, so no date is assumed.
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [emailTenant, setEmailTenant] = useState(false);
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

  function finish(message: string): void {
    onClose();
    showToast(message);
  }

  /** The server commits before it answers, so a failed answer doesn't mean nothing happened. */
  async function checkWhatHappened(newEndsOn: string, answered: boolean): Promise<void> {
    const latest = await refetch();
    if (latest.isError || !latest.data) {
      setFailure(LEASE_MESSAGES.extendUnsure);
    } else if (latest.data.ends_on === newEndsOn) {
      const longDate = formatLongDate(newEndsOn);
      finish(emailTenant ? extendedEmailUnknown(longDate) : extendedTo(longDate));
    } else if (latest.data.ends_on && latest.data.ends_on > endsOn) {
      setFailure(alreadyEnds(formatLongDate(latest.data.ends_on)));
    } else {
      // With no answer at all, the server could still be working on it.
      setFailure(answered ? LEASE_MESSAGES.extendFailedNothingChanged : LEASE_MESSAGES.extendNotSeen);
    }
  }

  function submit(): void {
    if (!isLater || isSubmitting.current) return;
    if (!emailTenant) {
      void send(picked);
      return;
    }
    isSubmitting.current = true;
    const release = () => {
      isSubmitting.current = false;
    };
    Alert.alert(
      extendAndEmailTitle(tenantName),
      extendAndEmailBody(formatLongDate(picked)),
      [
        { text: LEASE_MESSAGES.cancel, style: "cancel", onPress: release },
        { text: LEASE_MESSAGES.extendAndEmail, onPress: () => void send(picked) },
      ],
      { cancelable: true, onDismiss: release },
    );
  }

  async function send(newEndsOn: string): Promise<void> {
    isSubmitting.current = true;
    setIsBusy(true);
    setFailure(null);
    try {
      await extendLease({ leaseId, data: { new_ends_on: newEndsOn, notes: note.trim() || undefined, email_tenant: emailTenant } }).unwrap();
      const longDate = formatLongDate(newEndsOn);
      finish(emailTenant ? extendedAndEmailing(longDate) : extendedTo(longDate));
    } catch (error) {
      const known = extendLeaseFailure(error);
      if (isMissingTenantEmail(error)) {
        setEmailTenant(false);
        void refetchApplicant();
      }
      if (known) setFailure(known);
      else await checkWhatHappened(newEndsOn, httpStatus(error) !== undefined);
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

          {applicant?.has_contact_email ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, minHeight: MIN_TOUCH_TARGET }}>
              <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.foreground }}>{emailAddendumLabel(tenantName)}</Text>
              <Switch accessibilityLabel={emailAddendumLabel(tenantName)} disabled={isBusy} onValueChange={setEmailTenant} value={emailTenant} />
            </View>
          ) : null}
          {applicant?.has_contact_email === false ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{LEASE_MESSAGES.noEmailOnFile}</Text> : null}

          <LoadingButton disabled={!isLater} isLoading={isBusy} loadingText={LEASE_MESSAGES.extending} onPress={submit}>
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
