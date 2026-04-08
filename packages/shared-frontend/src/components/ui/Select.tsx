import { forwardRef } from "react";
import { cn } from "@/shared/utils/cn";

interface Props extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
}

const Select = forwardRef<HTMLSelectElement, Props>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn("border rounded-md px-3 py-2 text-sm", className)}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = "Select";

export default Select;
