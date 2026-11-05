import { useLazyGetSignedLeaseByIdQuery, useCreateSignedLeaseMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { MergedPlaceholder } from "@mybookkeeper/api-client/types/lease/merged-placeholder";
import { Banner, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, type ScrollViewInstance, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { draftMade, leaseFor, NEW_LEASE_MESSAGES as MESSAGES, PROVENANCE_CAPTIONS, usedIn } from "../../constants/newLease";
import { useConfirmLeave } from "../../lib/useConfirmLeave";
import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import { leaseConflictCode } from "../leases/leaseConflictCode";
import { isOutOfDateForm, newLeaseFailure } from "./newLeaseFailure";
import PlaceholderField from "./PlaceholderField";
import type { PlaceholderEdits } from "../../types/PlaceholderEdits";
import { hasChanges, leaseValues, missingRequired, placeholderValue } from "./placeholderValues";
import { useLeaveNewLeaseFlow } from "./useLeaveNewLeaseFlow";

interface NewLeaseFormProps {
  flow: NewLeaseFlow;
  applicantId: string;
  applicantName: string;
  fields: readonly MergedPlaceholder[];
  templateNames: Readonly<Record<string, string>>;
  /** Pulls the fields again, for when a template changed after they loaded. */
  onOutOfDate: () => void;
}

export default function NewLeaseForm({ flow, applicantId, applicantName, fields, templateNames, onOutOfDate }: NewLeaseFormProps) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const leaveFlow = useLeaveNewLeaseFlow();
  const [createLease, { isLoading }] = useCreateSignedLeaseMutation();
  const [getParentLease] = useLazyGetSignedLeaseByIdQuery();
  const [edits, setEdits] = useState<PlaceholderEdits>({});
  const [showMissing, setShowMissing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [isFindingNewer, setIsFindingNewer] = useState(false);
  const isSubmitting = useRef(false);
  const scroller = useRef<ScrollViewInstance>(null);
  const fieldTops = useRef<Record<string, number>>({});
  const isDirty = hasChanges(fields, edits);
  const missing = missingRequired(fields, edits);

  const isBusy = isLoading || isFindingNewer;
  useConfirmLeave((isDirty || isBusy) && !leaveTo, (leave) => {
    if (isSubmitting.current) return;
    Alert.alert(MESSAGES.discardTitle, MESSAGES.discardBody, [
      { text: MESSAGES.keepEditing, style: "cancel" },
      { text: MESSAGES.discard, style: "destructive", onPress: leave },
    ]);
  });

  // Leaving has to wait a render, or the guard above still refuses it.
  useEffect(() => {
    if (leaveTo) leaveFlow(leaveTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leaves once, when there's somewhere to go.
  }, [leaveTo]);

  function confirmReset(): void {
    Alert.alert(MESSAGES.resetTitle, MESSAGES.resetBody, [
      { text: MESSAGES.keepEdits, style: "cancel" },
      { text: MESSAGES.resetConfirm, style: "destructive", onPress: () => setEdits({}) },
    ]);
  }

  /** Also how a retry lands when the first try worked but its answer was lost. */
  async function openNewerLease(parentLeaseId: string): Promise<void> {
    setIsFindingNewer(true);
    const parent = await getParentLease(parentLeaseId).unwrap().catch(() => null);
    setIsFindingNewer(false);
    if (parent?.successor_lease_id) {
      showToast(MESSAGES.newerExists);
      setLeaveTo(parent.successor_lease_id);
    } else {
      setFailure(MESSAGES.newerExistsNotFound);
    }
  }

  async function submit(): Promise<void> {
    // Once it's made, a tap before the screen goes would make another.
    if (isSubmitting.current || leaveTo) return;
    Keyboard.dismiss();
    if (missing.length > 0) {
      setShowMissing(true);
      setFailure(MESSAGES.needMoreAnswers);
      scroller.current?.scrollTo({ y: fieldTops.current[missing[0].placeholder.key] ?? 0 });
      return;
    }
    isSubmitting.current = true;
    setFailure(null);
    try {
      const created = await createLease({
        template_ids: flow.templateIds,
        applicant_id: applicantId,
        values: leaseValues(fields, edits),
        ...(flow.parentLeaseId ? { parent_lease_id: flow.parentLeaseId } : {}),
      }).unwrap();
      showToast(draftMade(flow.templateIds.length));
      setLeaveTo(created.id);
    } catch (error) {
      if (flow.parentLeaseId && leaseConflictCode(error) === "SUCCESSOR_ALREADY_EXISTS") {
        await openNewerLease(flow.parentLeaseId);
      } else if (isOutOfDateForm(error)) {
        setShowMissing(true);
        setFailure(MESSAGES.changedSince);
        onOutOfDate();
      } else {
        setFailure(newLeaseFailure(error));
      }
      // The message is at the top and the button stays at the bottom, so they may be far apart.
      scroller.current?.scrollTo({ y: 0 });
    } finally {
      isSubmitting.current = false;
    }
  }

  function captionFor(field: MergedPlaceholder): string | null {
    const isEdited = placeholderValue(field, edits) !== (field.value ?? "");
    const provenance = isEdited ? "manual" : field.provenance;
    const names = field.template_ids.map((id) => templateNames[id]).filter((name): name is string => Boolean(name));
    const parts = [provenance ? PROVENANCE_CAPTIONS[provenance] : null, names.length > 1 ? usedIn(names) : null];
    return parts.filter(Boolean).join(" · ") || null;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        ref={scroller}
        testID="new-lease-form"
      >
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.whatGoesIn}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{leaseFor(applicantName, flow.templateIds.map((id) => templateNames[id]).filter((name): name is string => Boolean(name)))}</Text>
        </View>
        {flow.parentLeaseId ? (
          <Banner actions={[{ label: MESSAGES.seeEarlier, onPress: () => router.push(`/leases/${flow.parentLeaseId}`) }]} message={MESSAGES.followsEarlier} tone="success" />
        ) : null}
        {failure ? <Banner message={failure} /> : null}
        {fields.length === 0 ? <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{MESSAGES.nothingToFill}</Text> : null}
        {fields.map((field) => {
          const { key } = field.placeholder;
          return (
            <View
              key={key}
              onLayout={(event) => {
                fieldTops.current[key] = event.nativeEvent.layout.y;
              }}
            >
              <PlaceholderField
                caption={captionFor(field)}
                error={showMissing && missing.includes(field) ? MESSAGES.required : undefined}
                isDisabled={isBusy}
                onChange={(value) => setEdits((current) => ({ ...current, [key]: value }))}
                placeholder={field.placeholder}
                value={placeholderValue(field, edits)}
              />
            </View>
          );
        })}
        {isDirty ? (
          <LoadingButton disabled={isBusy} onPress={confirmReset} variant="ghost">
            {MESSAGES.reset}
          </LoadingButton>
        ) : null}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <LoadingButton isLoading={isBusy} loadingText={MESSAGES.creatingDraft} onPress={() => void submit()}>
          {MESSAGES.createDraft}
        </LoadingButton>
      </View>
    </KeyboardAvoidingView>
  );
}
