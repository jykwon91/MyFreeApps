export interface TransactionFieldErrorProps {
  id: string;
  message?: string;
}

export default function TransactionFieldError({ id, message }: TransactionFieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
      {message}
    </p>
  );
}
