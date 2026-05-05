export interface ChevronDownProps {
  className?: string;
}

export default function ChevronDown({ className = "h-4 w-4" }: ChevronDownProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
