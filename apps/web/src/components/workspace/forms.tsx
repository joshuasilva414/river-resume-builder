import type { ProblemDetails } from "@river/contracts";
import {
  cloneElement,
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";
export class RequestFailure extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.title);
  }
}
export function unwrap<A>(
  result: { ok: true; value: A } | { ok: false; error: ProblemDetails },
): A {
  if (!result.ok) throw new RequestFailure(result.error);
  return result.value;
}
export function Failure({ error }: { error: Error | null }) {
  return error ? (
    <Alert variant="destructive">
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  ) : null;
}
export function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-2 text-sm font-medium">
      {label}
      {cloneElement(children, { id })}
    </label>
  );
}
export const selectClass =
  "h-11 w-full min-w-0 rounded-sm border bg-background px-3 text-base font-normal md:h-10 md:text-sm";
const DialogSurfaceContext = createContext<{
  host: HTMLDivElement | null;
  register: (id: string, close: () => void, title: string) => () => void;
} | null>(null);

/** Nested steps replace the visible surface while their parent form stays mounted. */
export function WorkspaceDialog({
  title,
  description,
  children,
  onClose,
  dirty = false,
  pending = false,
  wide = false,
  className,
  returnFocusRef,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  dirty?: boolean;
  pending?: boolean;
  wide?: boolean;
  className?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const parent = useContext(DialogSurfaceContext),
    id = useId();
  const [discard, setDiscard] = useState(false),
    [host, setHost] = useState<HTMLDivElement | null>(null);
  const [child, setChild] = useState<{ id: string; close: () => void; title: string } | null>(null);
  const register = useCallback((childId: string, close: () => void, title: string) => {
    setChild({ id: childId, close, title });
    return () => setChild((current) => (current?.id === childId ? null : current));
  }, []);
  const context = useMemo(() => ({ host, register }), [host, register]);
  const close = () => {
    if (child) child.close();
    else if (!pending) dirty ? setDiscard(true) : onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  const activeTitle = child?.title ?? (discard ? "Discard unsaved changes?" : title);
  useEffect(
    () => parent?.register(id, () => closeRef.current(), activeTitle),
    [parent?.register, id, activeTitle],
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const [returnFocus] = useState(() =>
    typeof document === "undefined" ? null : document.activeElement,
  );
  useEffect(() => {
    if (!parent?.host) return;
    heading.current?.focus();
    return () => {
      requestAnimationFrame(() => {
        if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
      });
    };
  }, [parent?.host, returnFocus]);
  const headingText = discard ? "Discard unsaved changes?" : title;
  const body = (
    <DialogSurfaceContext.Provider value={context}>
      <div hidden={Boolean(child)} className="space-y-5">
        {parent ? (
          <header className="space-y-3">
            <Button
              type="button"
              variant="link"
              className="px-0"
              disabled={pending}
              onClick={close}
            >
              ← Back
            </Button>
            <h2 ref={heading} tabIndex={-1} className="text-[28px] leading-[34px]">
              {headingText}
            </h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </header>
        ) : (
          <DialogHeader className="shrink-0 text-left pr-8">
            <DialogTitle className="text-[28px] leading-[34px]">{headingText}</DialogTitle>
            <DialogDescription>
              {discard ? "Your saved work will remain. Discard this unsaved form?" : description}
            </DialogDescription>
          </DialogHeader>
        )}
        {discard && (
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setDiscard(false)}>
              Keep editing
            </Button>
            <Button type="button" variant="destructive" onClick={onClose}>
              Discard changes
            </Button>
          </div>
        )}
        <div className="shrink-0" hidden={discard}>
          {children}
        </div>
      </div>
      <div ref={setHost} />
    </DialogSurfaceContext.Provider>
  );
  if (parent) return parent.host ? createPortal(body, parent.host) : null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        aria-label={activeTitle}
        aria-labelledby={undefined}
        className={cn(
          `evidence-dialog flex max-h-[90dvh] flex-col gap-5 overflow-y-auto max-sm:inset-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:p-5 ${wide ? "sm:max-w-[900px]" : "sm:max-w-[616px]"}`,
          className,
        )}
        onEscapeKeyDown={(event) => {
          if (child || dirty || pending) {
            event.preventDefault();
            close();
          }
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current ?? returnFocus;
          if (target instanceof HTMLElement && target.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}
