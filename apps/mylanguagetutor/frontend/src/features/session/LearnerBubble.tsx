interface LearnerBubbleProps {
  text: string;
}

/** What the learner said (as recognised) or typed. */
export default function LearnerBubble({ text }: LearnerBubbleProps) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
        {text}
      </p>
    </div>
  );
}
