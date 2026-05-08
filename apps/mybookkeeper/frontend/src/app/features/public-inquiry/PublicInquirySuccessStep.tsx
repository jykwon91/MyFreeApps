export default function PublicInquirySuccessStep() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="bg-card border rounded-lg p-8 w-full max-w-md shadow-sm text-center">
        <h1 className="text-2xl font-semibold mb-4">Thanks!</h1>
        <p className="text-sm text-muted-foreground">
          The host will review and respond within 1-2 business days. Check
          your email for confirmation.
        </p>
      </div>
    </div>
  );
}
