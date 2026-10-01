import { useEffect, useRef, useState } from "react";

/**
 * Shared visibility-aware polling — the main Neon egress saver for reads.
 *
 * - Polls every `visibleMs` while the tab is visible AND the browser is online.
 * - Backs off to `hiddenMs` (default 5 min) when the tab is hidden instead of
 *   hammering Postgres from background tabs.
 * - Refetches immediately when the tab regains visibility or the network
 *   comes back, so longer intervals never feel stale.
 * - Never polls while `enabled` is false or there is no network.
 */
export function useVisiblePolling(
  fn: () => void,
  visibleMs: number,
  enabled = true,
  hiddenMs = 300_000,
) {
  const [visible, setVisible] = useState(
    () =>
      typeof document === "undefined" ||
      document.visibilityState === "visible",
  );
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !online) return;
    fnRef.current();
    const id = window.setInterval(
      () => {
        if (document.visibilityState !== "visible") return;
        fnRef.current();
      },
      visibleMs,
    );
    // Background safety net: one slow tick so a tab left open overnight
    // costs ~12 requests/hour instead of ~120, plus an instant refetch
    // on visibilitychange via the `visible` state flip below.
    const slowId = window.setInterval(() => {
      if (document.visibilityState === "visible") return;
      fnRef.current();
    }, hiddenMs);
    return () => {
      window.clearInterval(id);
      window.clearInterval(slowId);
    };
  }, [enabled, online, visible, visibleMs, hiddenMs]);
}
