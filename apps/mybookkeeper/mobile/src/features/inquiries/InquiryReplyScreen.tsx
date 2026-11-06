import {
  useGetInquiryByIdQuery,
  useGetReplyTemplatesQuery,
  useLazyRenderReplyTemplateQuery,
  useSendInquiryReplyMutation,
} from "@mybookkeeper/api-client/store/inquiriesApi";
import { useGetIntegrationsQuery } from "@mybookkeeper/api-client/store/integrationsApi";
import { Banner, EmptyState, FormField, LoadingButton, OptionSheet, Skeleton, useAnnouncement, useTheme, useToast } from "@platform/mobile";
import { router, usePreventRemove } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_BASE_URL } from "../../constants/api";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import { REPLY_BODY_MAX_LENGTH, REPLY_BODY_MIN_HEIGHT, REPLY_CHECK_DELAYS_MS, REPLY_SUBJECT_MAX_LENGTH, WRITE_MY_OWN_OPTION } from "../../constants/replies";
import type { ReplyBlock } from "../../types/ReplyBlock";
import type { ReplySendFailure } from "@mybookkeeper/api-client/types/inquiry/reply-send-failure";
import { replyMightHaveSent } from "@mybookkeeper/api-client/utils/replyMightHaveSent";
import { replySendFailure } from "@mybookkeeper/api-client/utils/replySendFailure";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { useCanWrite } from "../workspace/useCanWrite";
import { deleteReplyDraft } from "./replyDrafts";
import { matchesRendered, REPLY_BLOCK_WORDS, REPLY_FAILURE_WORDS, replyArrived, replyBlock } from "./replyStatus";
import { useOpenLink } from "./useOpenLink";
import { useReplyDraft } from "./useReplyDraft";

export default function InquiryReplyScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const canWrite = useCanWrite();
  const openLink = useOpenLink();
  const { currentData: inquiry, error: loadError, isFetching, refetch: refetchInquiry } = useGetInquiryByIdQuery(id);
  const { data: integrations, refetch: refetchIntegrations } = useGetIntegrationsQuery();
  const { data: templates, error: templatesError, refetch: refetchTemplates } = useGetReplyTemplatesQuery();
  const [renderTemplate, { isFetching: isRendering }] = useLazyRenderReplyTemplateQuery();
  const [sendReply] = useSendInquiryReplyMutation();
  const { draft, change, wasRestored, startOver, settleRestored } = useReplyDraft(id);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [rendered, setRendered] = useState<{ subject: string; body: string } | null>(null);
  const [failure, setFailure] = useState<ReplySendFailure | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [mightHaveSent, setMightHaveSent] = useState(false);
  const [hasSent, setHasSent] = useState(false);
  const chosenTemplate = useRef<string | null>(null);
  const isSubmitting = useRef(false);

  useAnnouncement(hasSent ? "Reply sent" : isBusy ? "Sending reply" : undefined);
  // Sending can't be walked away from: the result would have nowhere to go.
  usePreventRemove(isBusy && !hasSent, () => undefined);

  // After the guard above has let go, or going back would be refused.
  useEffect(() => {
    if (hasSent) router.back();
  }, [hasSent]);

  if (!canWrite) return <EmptyState body="Ask the workspace owner if you need to reply." heading="You have view-only access." />;
  if (!inquiry && (isFetching || !loadError)) {
    return (
      <View accessibilityLabel="Loading this inquiry" style={{ gap: spacing.md, padding: spacing.lg }}>
        <Skeleton height={20} width="60%" />
        <Skeleton height={48} />
        <Skeleton height={160} />
      </View>
    );
  }
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

  async function hasReplyArrived(knownIds: readonly string[], body: string): Promise<boolean> {
    for (const delay of REPLY_CHECK_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const latest = await refetchInquiry();
      if (replyArrived(latest.data?.messages, knownIds, body)) return true;
    }
    return false;
  }

  async function attemptSend(): Promise<void> {
    if (!inquiry) return;
    setFailure(null);
    // Fresh, or a reply sent from the website since this loaded would pass for this one.
    const before = await refetchInquiry();
    const knownIds = (before.data ?? inquiry).messages.map((message) => message.id);
    const text = { subject: draft.subject.trim(), body: draft.body };
    try {
      await sendReply({ inquiryId: id, data: { template_id: draft.templateId, ...text } }).unwrap();
    } catch (error) {
      const reason = replySendFailure(error);
      if (reason === "unsure" && (await hasReplyArrived(knownIds, text.body))) {
        finish();
        return;
      }
      if (replyMightHaveSent(reason)) setMightHaveSent(true);
      if (reason === "gmailDisconnected" || reason === "gmailConnection") {
        const latest = await refetchIntegrations();
        // Otherwise the block's words say this, and go when Gmail's reconnected.
        if (replyBlock(latest.data, email)) return;
      }
      setFailure(reason);
      return;
    }
    finish();
  }

  async function send(): Promise<void> {
    // A second tap can land before the button has redrawn as disabled.
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setIsBusy(true);
    try {
      await attemptSend();
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
        {failure && !block ? <Banner message={REPLY_FAILURE_WORDS[failure]} /> : null}
        {email ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`To: ${email}`}</Text> : null}
        {wasRestored ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.mutedForeground }}>Restored your draft</Text>
            <LoadingButton onPress={startOver} variant="ghost">
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
        <LoadingButton disabled={!canSend} isLoading={isBusy} loadingText="Sending…" onPress={() => void send()}>
          {mightHaveSent ? "Send again" : "Send"}
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
