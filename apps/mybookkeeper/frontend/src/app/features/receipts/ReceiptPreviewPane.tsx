export interface ReceiptPreviewPaneProps {
  url: string | null;
  error: string | null;
}

export default function ReceiptPreviewPane({ url, error }: ReceiptPreviewPaneProps) {
  if (error) {
    return (
      <p className="text-sm text-destructive p-6 text-center" data-testid="receipt-preview-error">
        {error}
      </p>
    );
  }
  if (url) {
    return (
      <iframe
        src={url}
        title="Receipt preview"
        data-testid="receipt-preview-iframe"
        className="w-full h-full min-h-64 bg-white"
        style={{ border: "none", colorScheme: "light" }}
      />
    );
  }
  return (
    <p className="text-sm text-muted-foreground p-6 text-center">
      Click "Preview PDF" to see what the tenant will receive.
    </p>
  );
}
