import { useCreateLeaseTemplateMutation, useSuggestPlaceholdersMutation } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import type { LeaseTemplateDetail } from "@mybookkeeper/api-client/types/lease/lease-template-detail";
import { filePart, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { LEASE_TEMPLATE_CREATE_COPY } from "@mybookkeeper/api-client/constants/leaseTemplateCreateCopy";
import { templateCreated } from "../../constants/leaseTemplateForm";
import { useLeaseTemplateWrite } from "../../lib/useLeaseTemplateWrite";
import { holdSuggestions } from "./leaseTemplateSuggestions";
import type { NewLeaseTemplate } from "../../types/NewLeaseTemplate";

/**
 * Uploads a new template, then has the AI read it for placeholders before opening it. The read is
 * a bonus: if it fails the template is still made and opens with the placeholders the brackets gave.
 */
export function useCreateLeaseTemplate(onUploaded: () => void) {
  const { showToast } = useToast();
  const [createTemplate] = useCreateLeaseTemplateMutation();
  const [suggestPlaceholders] = useSuggestPlaceholdersMutation();
  const write = useLeaseTemplateWrite(LEASE_TEMPLATE_CREATE_COPY);
  const [isReading, setIsReading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const savedId = useRef<string | null>(null);
  const hasOpenedEarly = useRef(false);

  // It waits a render so the discard question no longer sees unsaved changes when the screen is replaced.
  useEffect(() => {
    if (openId) router.replace(`/lease-templates/${openId}`);
  }, [openId]);

  async function submit({ name, description, files }: NewLeaseTemplate): Promise<void> {
    const form = new FormData();
    form.append("name", name.trim());
    if (description.trim()) form.append("description", description.trim());
    for (const file of files) form.append("files", filePart(file));
    let created: LeaseTemplateDetail | null = null;
    const result = await write.run(
      async () => {
        created = await createTemplate(form).unwrap();
      },
      { staysLocked: true },
    );
    if (result !== "done" || !created) return;
    const template: LeaseTemplateDetail = created;
    savedId.current = template.id;
    onUploaded();
    setIsReading(true);
    try {
      const suggestions = await suggestPlaceholders(template.id).unwrap();
      // Someone who went on without waiting has already opened the template, so these would only turn up on a later visit.
      if (!hasOpenedEarly.current) holdSuggestions(template.id, suggestions);
    } catch {
      // The AI read is a bonus. The template is made, so go on with the placeholders the brackets gave.
    }
    showToast(templateCreated(template.name));
    setOpenId(template.id);
  }

  /** Back during the AI read: the template is already saved, so open it without the suggestions. */
  function openNow(): void {
    if (!savedId.current) return;
    hasOpenedEarly.current = true;
    setOpenId(savedId.current);
  }

  return { submit, openNow, isBusy: write.isBusy, isReading, isLeaving: openId !== null, message: write.message };
}
