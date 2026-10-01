import { useEffect, type RefObject } from "react";

/**
 * U3 — keyboard trap for modal dialogs: focuses the dialog on open and keeps
 * Tab cycling inside while open. Escape stays with the existing global
 * handlers (entry modal, help panel).
 */
export function useFocusTrap<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    el?.focus({ preventScroll: true });
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== "Tab" || !ref.current) return;
      const items = ref.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (items.length === 0) {
        ev.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, active]);
}
