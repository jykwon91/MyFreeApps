import {
  APPLICANT_EMPLOYER_MAX,
  APPLICANT_LEGAL_NAME_MAX,
  APPLICANT_PETS_MAX,
  APPLICANT_REFERRED_BY_MAX,
  APPLICANT_VEHICLE_MAX,
} from "@mybookkeeper/api-client/constants/applicantPromote";
import { usePromoteFromInquiryMutation } from "@mybookkeeper/api-client/store/applicantsApi";
import type { InquiryResponse } from "@mybookkeeper/api-client/types/inquiry/inquiry-response";
import { promoteConflictDetail } from "@mybookkeeper/api-client/utils/applicantPromoteConflict";
import { Banner, FormField, LoadingButton, SegmentedControl, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, type ScrollViewInstance, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DOB_PICKER_STARTS_YEARS_AGO, PROMOTE_MESSAGES, SMOKER_SEGMENTS } from "../../constants/promote";
import type { PromoteValues } from "../../types/PromoteValues";
import OptionalDateField from "../shell/OptionalDateField";
import { promoteFailure } from "./applicantFailures";
import { isOldEnough, promoteRequest, promoteValuesFrom } from "./promoteValues";
import { useConfirmLeave } from "../../lib/useConfirmLeave";

export default function PromoteForm({ inquiry }: { inquiry: InquiryResponse }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [promote, { isLoading }] = usePromoteFromInquiryMutation();
  const [initial] = useState(() => promoteValuesFrom(inquiry));
  const [values, setValues] = useState<PromoteValues>(initial);
  const [failure, setFailure] = useState<string | null>(null);
  const [isNotPromotable, setIsNotPromotable] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const isSubmitting = useRef(false);
  const scroller = useRef<ScrollViewInstance>(null);

  const today = new Date();
  const isTooYoung = values.dob !== null && !isOldEnough(values.dob, today);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);

  useConfirmLeave((isDirty || isLoading) && !leaveTo, (leave) => {
    if (isSubmitting.current) return;
    Alert.alert("Discard this?", "They haven't been promoted yet.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: leave },
    ]);
  });

  // Leaving has to wait a render, or the guard above still refuses it.
  useEffect(() => {
    if (leaveTo) router.replace(`/applicants/${leaveTo}`);
  }, [leaveTo]);

  function update(change: Partial<PromoteValues>): void {
    setValues((current) => ({ ...current, ...change }));
  }

  async function submit(): Promise<void> {
    if (isTooYoung) {
      showToast(PROMOTE_MESSAGES.tooYoung, "error");
      return;
    }
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setFailure(null);
    try {
      const created = await promote({ inquiryId: inquiry.id, data: promoteRequest(values) }).unwrap();
      showToast(PROMOTE_MESSAGES.success);
      setLeaveTo(created.id);
    } catch (error) {
      const conflict = promoteConflictDetail(error);
      if (conflict?.code === "already_promoted") {
        // Also how a retry lands when the first try worked but its answer was lost.
        showToast(PROMOTE_MESSAGES.alreadyPromoted);
        setLeaveTo(conflict.applicant_id);
      } else if (conflict?.code === "not_promotable") {
        setIsNotPromotable(true);
        setFailure(PROMOTE_MESSAGES.notPromotable);
      } else {
        setFailure(promoteFailure(error));
      }
    } finally {
      isSubmitting.current = false;
    }
    // The message is at the top and the button stays at the bottom, so they may be far apart.
    scroller.current?.scrollTo({ y: 0 });
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        ref={scroller}
      >
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>I filled in what I could from the inquiry. Everything's optional, but if you clear something the inquiry has, I'll use the inquiry's.</Text>
        {failure ? <Banner message={failure} /> : null}
        <FormField autoCapitalize="words" label="Legal name" maxLength={APPLICANT_LEGAL_NAME_MAX} onChangeText={(legalName) => update({ legalName })} value={values.legalName} />
        <OptionalDateField
          error={isTooYoung ? PROMOTE_MESSAGES.tooYoung : undefined}
          label="Date of birth"
          maximumDate={today}
          onChange={(dob) => update({ dob })}
          startsAt={new Date(today.getFullYear() - DOB_PICKER_STARTS_YEARS_AGO, 0, 1)}
          value={values.dob}
        />
        <FormField label="Employer or hospital" maxLength={APPLICANT_EMPLOYER_MAX} onChangeText={(employer) => update({ employer })} value={values.employer} />
        <OptionalDateField label="Contract start" onChange={(contractStart) => update({ contractStart })} startsAt={today} value={values.contractStart} />
        <FormField label="Vehicle" maxLength={APPLICANT_VEHICLE_MAX} onChangeText={(vehicle) => update({ vehicle })} value={values.vehicle} />
        <View style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: colors.foreground }}>Smoker</Text>
          <SegmentedControl accessibilityLabel="Smoker" onChange={(smoker) => update({ smoker })} segments={SMOKER_SEGMENTS} value={values.smoker} />
        </View>
        <FormField
          inputStyle={{ minHeight: 72, textAlignVertical: "top" }}
          label="Pets"
          maxLength={APPLICANT_PETS_MAX}
          multiline
          onChangeText={(pets) => update({ pets })}
          value={values.pets}
        />
        <FormField label="Referred by" maxLength={APPLICANT_REFERRED_BY_MAX} onChangeText={(referredBy) => update({ referredBy })} value={values.referredBy} />
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
        <LoadingButton disabled={isNotPromotable} isLoading={isLoading} loadingText="Promoting…" onPress={() => void submit()}>
          Promote
        </LoadingButton>
      </View>
    </KeyboardAvoidingView>
  );
}
