export interface LoadingStateProps {
  text?: string;
  fullHeight?: boolean;
}

export default function LoadingState({ text = "Loading...", fullHeight = false }: LoadingStateProps) {
  if (fullHeight) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground text-sm">{text}</p>
      </div>
    );
  }

  return <p className="text-muted-foreground text-sm">{text}</p>;
}
