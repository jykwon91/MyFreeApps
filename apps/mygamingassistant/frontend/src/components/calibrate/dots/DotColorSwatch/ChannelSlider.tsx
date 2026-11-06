interface ChannelSliderProps {
  label: string;
  value: number;
  onChange: (raw: string) => void;
}

export default function ChannelSlider({ label, value, onChange }: ChannelSliderProps) {
  const id = `dot-channel-${label.toLowerCase()}`;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-4 text-xs font-mono text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={255}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-valuetext={`${label}: ${value}`}
        className="flex-1"
      />
      <input
        type="number"
        min={0}
        max={255}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-16 px-2 py-1 rounded-md border bg-background text-xs font-mono"
        aria-label={`${label} channel numeric value`}
      />
    </div>
  );
}
