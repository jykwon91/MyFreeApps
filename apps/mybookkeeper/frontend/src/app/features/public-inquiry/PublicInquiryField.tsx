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
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="mt-1 text-xs text-red-600"
          role="alert"
          data-testid={`public-inquiry-${htmlFor}-error`}
        >
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
