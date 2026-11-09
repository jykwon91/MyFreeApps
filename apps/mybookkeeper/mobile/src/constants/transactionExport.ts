import type { TransactionExportFormat } from "@mybookkeeper/api-client/types/transaction/TransactionExportFormat";

export const TRANSACTION_EXPORT_FORMATS: readonly { value: TransactionExportFormat; label: string }[] = [
  { value: "csv", label: "CSV spreadsheet" },
  { value: "pdf", label: "PDF report" },
];

export const TRANSACTION_EXPORT_MESSAGES = {
  title: "Export transactions",
  export: "Export",
  exporting: "Exporting…",
  couldntExportCsv: "I couldn't export the CSV. Please try again in a bit.",
  couldntExportPdf: "I couldn't export the PDF. Please try again in a bit.",
  tooMany: "I've made a lot of exports this hour. Try again in a bit.",
  description: "Exports what the filters show.",
  notApplied: (parts: string) => `Not applied to exports: ${parts}.`,
} as const;
