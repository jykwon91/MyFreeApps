import {
  useGetInquiryByIdQuery,
  useGetReplyTemplatesQuery,
  useLazyRenderReplyTemplateQuery,
} from "@mybookkeeper/api-client/store/inquiriesApi";
import { useGetIntegrationsQuery } from "@mybookkeeper/api-client/store/integrationsApi";
import { Banner, EmptyState, FormField, LoadingButton, OptionSheet, useAnnouncement, useTheme, useToast } from "@platform/mobile";
import { router, usePreventRemove } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useReplySend } from "@mybookkeeper/api-client/hooks/useReplySend";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_BASE_URL } from "../../constants/api";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import { REPLY_BODY_MAX_LENGTH, REPLY_BODY_MIN_HEIGHT, REPLY_SUBJECT_MAX_LENGTH, WRITE_MY_OWN_OPTION } from "../../constants/replies";
import type { ReplyBlock } from "../../types/ReplyBlock";
import type { ReplyDraft } from "../../types/ReplyDraft";
import type { ReplySendFailure } from "@mybookkeeper/api-client/types/inquiry/reply-send-failure";
import { REPLY_SEND_ACTION } from "@mybookkeeper/api-client/constants/replySendAction";
import { replySendAction } from "@mybookkeeper/api-client/utils/replySendAction";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import InquiryReplySkeleton from "./InquiryReplySkeleton";
import { deleteReplyDraft } from "./replyDrafts";
import ReplySendNotice from "./ReplySendNotice";
import { REPLY_SEND_OPTIONS } from "./replySendOptions";
import { matchesRendered, REPLY_BLOCK_WORDS, REPLY_SEND_LABELS, REPLY_SEND_WORDS, replyBlock, replySendingAnnouncement } from "./replyStatus";
import { replyToSend } from "./replyToSend";
import { useOpenLink } from "./useOpenLink";
import { useReplyDraft } from "./useReplyDraft";

export default function InquiryReplyBody({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const openLink = useOpenLink();
  const { currentData: inquiry, error: loadError, isFetching, refetch: refetchInquiry } = useGetInquiryByIdQuery(id);
  const { data: integrations, refetch: refetchIntegrations } = useGetIntegrationsQuery();
  const { data: templates, error: templatesError, refetch: refetchTemplates } = useGetReplyTemplatesQuery();
  const [renderTemplate, { isFetching: isRendering }] = useLazyRenderReplyTemplateQuery();
  const { send: sendReply, isRetry, otherGmailAddress, isWaiting, mightHaveSent } = useReplySend(id, REPLY_SEND_OPTIONS);
  const { draft, change: saveDraft, wasRestored, startOver: clearDraft, settleRestored } = useReplyDraft(id);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [rendered, setRendered] = useState<{ subject: string; body: string } | null>(null);
  const [failure, setFailure] = useState<ReplySendFailure | null>(null);
  // The send, and the Gmail recheck after one fails.
  const [isBusy, setIsBusy] = useState(false);
  const [hasSent, setHasSent] = useState(false);
  const chosenTemplate = useRef<string | null>(null);
  const isSubmitting = useRef(false);

  useAnnouncement(replySendingAnnouncement(hasSent, isWaiting, isBusy));
  // Sending can't be walked away from: the result would have nowhere to go.
  usePreventRemove(isBusy && !hasSent, () => undefined);

  // After the guard above has let go, or going back would be refused.
  useEffect(() => {
    if (hasSent) router.back();
  }, [hasSent]);

  if (!inquiry && (isFetching || !loadError)) return <InquiryReplySkeleton />;
  if (!inquiry) {
    const isGone = httpStatus(loadError) === 404;
    return (
      <EmptyState
        action={isGone ? { label: "Back", onPress: () => router.back() } : { label: "Try again", onPress: () => void refetchInquiry() }}
        body={isGone ? "It may have been archived." : "Want me to try again?"}
        heading={isGone ? "I can't find that inquiry." : "I couldn't load that inquiry."}
      />
    );
  }

  const email = inquiry.inquirer_email;
  const toSend = replyToSend(draft);
  const draftIsRetry = isRetry(toSend);
  // Kept by the hook while this screen is open, so it outlives a failure cleared by editing.
  const draftOtherGmail = otherGmailAddress(toSend);
  const shownFailure = failure ?? (draftOtherGmail ? "otherAccount" : null);
  const sendAction = replySendAction(shownFailure, mightHaveSent, draftIsRetry);
  const block: ReplyBlock | null = replyBlock(integrations, email);
  const canSend = !block && !isRendering && Boolean(draft.subject.trim()) && Boolean(draft.body.trim());
  const hasOwnWords = Boolean(draft.subject.trim() || draft.body.trim()) && !matchesRendered(draft, rendered);
  const templateOptions = [
    { value: WRITE_MY_OWN_OPTION, label: "Write my own" },
    ...(templates ?? []).map((template) => ({ value: template.id, label: template.name })),
  ];
  const chosenName = templates?.find((template) => template.id === draft.templateId)?.name;
  const addsDisclosure =
    !draft.templateId && Boolean(inquiry.listing_id) && !inquiry.messages.some((message) => message.direction === "outbound");

  // What became of the last send no longer describes the reply being written.
  function change(next: ReplyDraft): void {
    setFailure(null);
    saveDraft(next);
  }

  function startOver(): void {
    setFailure(null);
    clearDraft();
  }

  function finish(): void {
    deleteReplyDraft(id);
    showToast("Reply sent.");
    setHasSent(true);
  }

  async function applyChoice(choice: string): Promise<void> {
    settleRestored();
    if (choice === WRITE_MY_OWN_OPTION) {
      setRendered(null);
      change({ subject: "", body: "", templateId: null });
      return;
    }
    try {
      const { subject, body } = await renderTemplate({ inquiryId: id, templateId: choice }).unwrap();
      setRendered({ subject, body });
      change({ subject, body, templateId: choice });
    } catch {
      showToast("I couldn't build that template. Want to try again?", "error");
    }
  }

  function runChosenTemplate(): void {
    const choice = chosenTemplate.current;
    chosenTemplate.current = null;
    if (!choice) return;
    if (!hasOwnWords) {
      void applyChoice(choice);
      return;
    }
    Alert.alert("Replace what you've written?", "This takes its place.", [
      { text: "Keep mine", style: "cancel" },
      { text: "Replace", style: "destructive", onPress: () => void applyChoice(choice) },
    ]);
  }

  async function attemptSend(): Promise<void> {
    const result = await sendReply(toSend);
    if (!result) return;
    if (result.ok) {
      finish();
      return;
    }
    if (result.failure === "gmailDisconnected" || result.failure === "gmailConnection") {
      const latest = await refetchIntegrations();
      // Otherwise the block's words say this, and go when Gmail's reconnected.
      if (replyBlock(latest.data, email)) return;
    }
    setFailure(result.failure);
  }

  async function send(): Promise<void> {
    // A second tap can land before the button has redrawn as disabled.
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setFailure(null);
    setIsBusy(true);
    try {
      await attemptSend();
    } catch (error) {
      // No request id could be made, or the send broke before it went: nothing was sent.
      console.error("Couldn't send the reply", error);
      setFailure("refused");
    } finally {
      isSubmitting.current = false;
      setIsBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {block ? (
          <Banner
            actions={block === "noEmailAddress" ? undefined : [{ label: "Open on the website", onPress: () => void openLink(`${WEB_BASE_URL}/integrations`) }]}
            message={REPLY_BLOCK_WORDS[block]}
          />
        ) : null}
        <ReplySendNotice
          changedAfterMightHaveSent={mightHaveSent && !draftIsRetry}
          failure={shownFailure}
          isBlocked={block !== null}
          otherGmailAddress={draftOtherGmail}
        />
        {email ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`To: ${email}`}</Text> : null}
        {wasRestored ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.mutedForeground }}>Restored your draft</Text>
            <LoadingButton disabled={isBusy} onPress={startOver} variant="ghost">
              Start over
            </LoadingButton>
          </View>
        ) : null}
        {templates && templates.length > 0 ? (
          <LoadingButton
            disabled={isBusy}
            isLoading={isRendering}
            loadingText="Hmm, let me build that for you..."
            onPress={() => setIsSheetOpen(true)}
            variant="secondary"
          >
            {chosenName ? `Template: ${chosenName}` : "Choose a template"}
          </LoadingButton>
        ) : templates ? (
          <LoadingButton disabled={isBusy} onPress={() => router.push("/reply-templates/new")} variant="ghost">
            {REPLY_TEMPLATE_MESSAGES.makeOne}
          </LoadingButton>
        ) : templatesError ? (
          <Banner
            actions={[{ label: REPLY_TEMPLATE_MESSAGES.tryAgain, onPress: () => void refetchTemplates() }]}
            message={REPLY_TEMPLATE_MESSAGES.templatesLoadFailed}
          />
        ) : null}
        <FormField
          editable={!isBusy && !isRendering}
          label="Subject"
          maxLength={REPLY_SUBJECT_MAX_LENGTH}
          onChangeText={(subject) => change({ ...draft, subject })}
          value={draft.subject}
        />
        <FormField
          editable={!isBusy && !isRendering}
          hint={addsDisclosure ? "If this listing has a pet disclosure, I'll add it to the top of your first reply." : undefined}
          inputStyle={{ minHeight: REPLY_BODY_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
          label="Message"
          maxLength={REPLY_BODY_MAX_LENGTH}
          multiline
          onChangeText={(body) => change({ ...draft, body })}
          value={draft.body}
        />
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
        <LoadingButton
          disabled={!canSend}
          isLoading={isBusy}
          loadingText={isWaiting ? REPLY_SEND_WORDS.stillSending : REPLY_SEND_WORDS.sending}
          onPress={() => void send()}
          variant={sendAction === REPLY_SEND_ACTION.SEND_ANYWAY ? "secondary" : "primary"}
        >
          {REPLY_SEND_LABELS[sendAction]}
        </LoadingButton>
      </View>
      <OptionSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onClosed={runChosenTemplate}
        onSelect={(choice) => {
          chosenTemplate.current = choice;
          setIsSheetOpen(false);
        }}
        options={templateOptions}
        title="Choose a template"
        value={draft.templateId ?? WRITE_MY_OWN_OPTION}
      />
    </KeyboardAvoidingView>
  );
}
