interface Props {
  label: string;
  required?: boolean;
  highlight?: boolean;
  dirty?: boolean;
  children: React.ReactNode;
}

export default function FormField({ label, required, highlight, dirty, children }: Props) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-medium mb-1">
        {highlight && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-orange-400" />}
        {dirty && !highlight && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400" />}
        <span>{label}</span>
        {dirty && <span className="text-blue-400 text-[10px] ml-1">modified</span>}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </label>
      {children}
    </div>
  );
}
