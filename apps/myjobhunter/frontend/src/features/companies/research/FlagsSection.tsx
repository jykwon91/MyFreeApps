import FlagList from "./FlagList";

interface FlagsSectionProps {
  greenFlags: string[];
  redFlags: string[];
}

export default function FlagsSection({ greenFlags, redFlags }: FlagsSectionProps) {
  if (greenFlags.length === 0 && redFlags.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {greenFlags.length > 0 ? (
        <FlagList title="Green flags" flags={greenFlags} icon="green" />
      ) : null}
      {redFlags.length > 0 ? (
        <FlagList title="Red flags" flags={redFlags} icon="red" />
      ) : null}
    </div>
  );
}
