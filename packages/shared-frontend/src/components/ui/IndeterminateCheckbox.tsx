import { useRef, useEffect } from "react";

interface Props {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onClick?: React.MouseEventHandler<HTMLInputElement>;
  "aria-label"?: string;
}

export default function IndeterminateCheckbox({ checked, indeterminate, onChange, onClick, "aria-label": ariaLabel }: Props) {
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
      className="cursor-pointer"
      aria-label={ariaLabel}
    />
  );
}
