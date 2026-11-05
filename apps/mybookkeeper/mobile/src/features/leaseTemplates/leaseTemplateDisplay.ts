import type { LeaseTemplateFile } from "@mybookkeeper/api-client/types/lease/lease-template-file";
import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";
import { formatFileSize } from "@mybookkeeper/api-client/utils/file-size";
import { LEASE_TEMPLATE_FILE_KINDS, LEASE_TEMPLATE_MESSAGES } from "../../constants/leaseTemplates";

function counted(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function templateCountsLine(template: Pick<LeaseTemplateSummary, "file_count" | "placeholder_count">): string {
  return `${counted(template.file_count, "file")}, ${counted(template.placeholder_count, "placeholder")}`;
}

export function templateRowLabel(template: LeaseTemplateSummary): string {
  const details = [template.description, templateCountsLine(template)].filter(Boolean).join(", ");
  return `${template.name}. ${details}`;
}

export function templateFileLine(file: Pick<LeaseTemplateFile, "content_type" | "size_bytes">): string {
  const kind = LEASE_TEMPLATE_FILE_KINDS[file.content_type];
  const size = formatFileSize(file.size_bytes);
  return kind ? `${kind}, ${size}` : size;
}

export function placeholdersLine(count: number): string {
  if (count === 0) return LEASE_TEMPLATE_MESSAGES.noPlaceholders;
  return `This template has ${counted(count, "placeholder")} that ${count === 1 ? "gets" : "get"} filled in when you make a lease on the website.`;
}

export function inDisplayOrder(files: readonly LeaseTemplateFile[]): LeaseTemplateFile[] {
  return [...files].sort((a, b) => a.display_order - b.display_order);
}
