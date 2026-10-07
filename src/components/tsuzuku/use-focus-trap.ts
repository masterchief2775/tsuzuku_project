import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard trap for modal dialogs: moves focus into the dialog on open, keeps
 * Tab cycling inside while open, handles Escape, and puts focus back on the
 * element that opened it when it closes.
 *
 * Without the restore step, closing a full-screen sheet drops focus on
 * `<body>` and the next Tab restarts from the top of the page — on a long
 * watchlist that is dozens of tabulations just to get back.
 *
 * `onEscape` is per-dialog on purpose: a single global Escape handler cannot
 * know which layer is on top, and it silently breaks as soon as a second modal
 * can be open.
 */
export function useFocusTrap<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  onEscape?: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    // Remember the trigger so focus can go back to it. Captured before the
    // dialog steals focus, and only if it is really in the document.
    const previous = document.activeElement as HTMLElement | null;
    const hadTrigger = Boolean(previous && previous !== document.body && previous.isConnected);

    el?.focus({ preventScroll: true });

    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        // Let the dialog's own handler run (it may want to ignore Escape while
        // a confirmation is pending), but never let it fall through to a
        // handler behind this layer.
        if (onEscape) {
          ev.preventDefault();
          ev.stopPropagation();
          onEscape();
        }
        return;
      }
      if (ev.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (items.length === 0) {
        ev.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      // Focus escaped the dialog (e.g. the trigger was removed): pull it back.
      if (!ref.current.contains(document.activeElement)) {
        ev.preventDefault();
        (ev.shiftKey ? last : first).focus();
        return;
      }
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (hadTrigger && previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
    // `onEscape` is intentionally not a dependency: callers pass an inline
    // arrow, and re-running the effect would re-capture the trigger (which, by
    // then, is the dialog itself) and break the restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, active]);
}