import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/shared/utils/cn";
import type { RowPrimaryActionProps } from "@/shared/types/row-primary-action-props";

function stopRowClick(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * The real control in a clickable table row's main cell, so keyboard and
 * screen-reader users can open the row. The row keeps its table semantics and
 * may still open on a mouse click anywhere; a click here stops at this control
 * so the row doesn't open twice.
 */
export default function RowPrimaryAction(props: RowPrimaryActionProps) {
  const className = cn(
    "rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    props.className,
  );

  if ("to" in props) {
    return (
      <Link to={props.to} onClick={stopRowClick} className={className} aria-label={props["aria-label"]}>
        {props.children}
      </Link>
    );
  }

  const { onActivate } = props;
  return (
    <button
      type="button"
      onClick={(event) => {
        stopRowClick(event);
        onActivate();
      }}
      className={className}
      aria-label={props["aria-label"]}
    >
      {props.children}
    </button>
  );
}
