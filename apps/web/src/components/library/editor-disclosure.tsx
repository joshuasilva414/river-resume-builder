import { type ReactNode, useEffect, useState } from "react";

/** Keep fields mounted so collapsing an editor never discards unsaved values. */
export function EditorDisclosure({
  title,
  summary,
  children,
  defaultOpen = false,
  revealKey,
  className = "",
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  revealKey?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (revealKey) setOpen(true);
  }, [revealKey]);
  return (
    <details
      className={`border-b ${className}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onInvalidCapture={(event) => {
        event.currentTarget.open = true;
        setOpen(true);
      }}
    >
      <summary className="cursor-pointer py-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-primary">
        {title}
        {summary && (
          <span className="mt-1 block truncate pl-5 text-sm font-normal text-muted-foreground">
            {summary}
          </span>
        )}
      </summary>
      <div className="space-y-4 pb-5 pl-5">{children}</div>
    </details>
  );
}

/** Native validation reveals the failing field; structural failures reveal the editor for correction. */
export function revealEditorErrors(form: HTMLFormElement) {
  const invalid = form.querySelector<HTMLElement>(":invalid");
  const details = invalid
    ? Array.from(form.querySelectorAll("details")).filter((item) => item.contains(invalid))
    : Array.from(form.querySelectorAll("details"));
  for (const item of details) item.open = true;
  invalid?.focus();
}
