import { FieldFeedback } from "@platform/ui";

interface PublicInquiryFieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export default function PublicInquiryField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: PublicInquiryFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium mb-1">
        {label}
      </label>
      {children}
      <FieldFeedback id={htmlFor} error={error} testId={`public-inquiry-${htmlFor}-error`} />
      {!error && hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
