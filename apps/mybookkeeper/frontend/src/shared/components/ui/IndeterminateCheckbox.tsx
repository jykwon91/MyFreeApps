import { useRef, useEffect } from "react";

export interface IndeterminateCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onClick?: React.MouseEventHandler<HTMLInputElement>;
  "aria-label"?: string;
  className?: string;
}

export default function IndeterminateCheckbox({ checked, indeterminate, onChange, onClick, "aria-label": ariaLabel, className = "cursor-pointer" }: IndeterminateCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange ?? (() => {})}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
