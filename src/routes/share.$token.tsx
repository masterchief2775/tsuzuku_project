import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BrandMark } from "@/components/tsuzuku/brand-mark";
import { AppFooter } from "@/components/tsuzuku/app-footer";
import { Cover } from "@/components/tsuzuku/cover";
import { fetchPublicShare, shareCardTitle, type PublicShareEntry, type PublicSharePayload } from "@/lib/share";
import { STATUSES, progressText } from "@/lib/watchlist";

export const Route = createFileRoute("/share/$token")({
  // SSR loader purely so crawlers (no JS) see a real <title> — the platform
  // OG injector derives og:title (+ the card image text) from it, since it
  // strips per-page og:* metas.
  loader: async ({ params }): Promise<PublicSharePayload | null> =>
    fetchPublicShare({ data: { token: params.token } }).catch(() => null),
  head: ({ loaderData }) => ({
    meta: [{ title: shareCardTitle(loaderData ?? null) }],
  }),
  component: PublicSharePage,
});

function PublicSharePage() {
  const { token } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const [entries, setEntries] = useState<PublicShareEntry[] | null>(
    loaderData?.entries ?? null,
  );
  const [ownerName, setOwnerName] = useState<string | null>(loaderData?.ownerName ?? null);
  const [error, setError] = useState(loaderData ? "" : "");
  const [loading, setLoading] = useState(!loaderData);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Loader data (SSR + SPA navigations): sync state + tab title, no fetch.
      if (loaderData !== undefined) {
        if (cancelled) return;
        if (loaderData) {
          setEntries(loaderData.entries);
          setOwnerName(loaderData.ownerName);
          setError("");
          document.title = shareCardTitle(loaderData);
        } else {
          setEntries(null);
          setOwnerName(null);
          setError("Ce lien de partage est invalide ou a été désactivé.");
          document.title = shareCardTitle(null);
        }
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchPublicShare({ data: { token } });
        if (cancelled) return;
        if (!data) {
          setError("Ce lien de partage est invalide ou a été désactivé.");
          setEntries(null);
        } else {
          setEntries(data.entries);
          setOwnerName(data.ownerName);
          setError("");
          document.title = shareCardTitle(data);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loaderData]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="border-b border-line px-4 py-5 sm:px-7">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3">
          <BrandMark />
          <div>
            <div className="font-serif text-xl font-semibold">Tsuzuku</div>
            <div className="text-xs text-dim">
              {ownerName ? `Liste de ${ownerName} · lecture seule` : "Liste partagée · lecture seule"}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 sm:px-7">
        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-lg border border-line bg-raised" />
            ))}
          </div>
        ) : null}
        {error ? (
          <div className="py-20 text-center">
            <p className="text-sm text-dim">{error}</p>
          </div>
        ) : null}
        {entries && !error ? (
          <>
            <p className="mb-5 text-sm text-dim">
              {entries.length} titre{entries.length > 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3.5">
              {entries.map((e) => {
                const meta = STATUSES.find((s) => s.key === e.status);
                return (
                  <div
                    key={e.anilistId}
                    className="overflow-hidden rounded-lg border border-line bg-raised"
                    style={{ ["--accent" as string]: meta?.color }}
                  >
                    <Cover src={e.image} title={e.title} className="h-[200px] w-full" />
                    <div className="px-3 pt-2.5 pb-3">
                      <div className="mb-1 min-h-[34px] text-[13px] leading-snug font-bold">
                        {e.title}
                      </div>
                      <div className="flex justify-between text-[11.5px] text-dim">
                        <span className="text-[var(--accent)]">{meta?.label ?? e.status}</span>
                        <span>
                          {progressText({
                            progress: e.progress,
                            totalEpisodes: e.totalEpisodes,
                            format: e.format,
                          })}
                        </span>
                      </div>
                      {e.rating != null ? (
                        <div className="mt-1 text-[11.5px] text-lime">{e.rating} ★</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </main>
      <AppFooter publicPage />
    </div>
  );
}
