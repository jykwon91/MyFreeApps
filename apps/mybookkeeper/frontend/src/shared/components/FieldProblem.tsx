interface FieldProblemProps {
  id: string;
  message: string | undefined;
}

/** The reason one field can't be saved, shown right under it. Renders nothing when the field is fine. */
export default function FieldProblem({ id, message }: FieldProblemProps) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-destructive" data-testid={id}>
      {message}
    </p>
  );
}
