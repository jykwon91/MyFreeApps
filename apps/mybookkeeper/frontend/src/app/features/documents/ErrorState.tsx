export interface ErrorStateProps {
  message: string;
}

export default function ErrorState({ message }: ErrorStateProps) {
  return (
    <p
      className="flex items-center justify-center h-full text-sm text-destructive px-4 text-center"
      data-testid="document-error"
    >
      {message}
    </p>
  );
}
