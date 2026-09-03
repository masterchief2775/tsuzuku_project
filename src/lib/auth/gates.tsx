import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import { authEnabled, signOut } from "./client";
import { useWatchlistStore } from "@/store/watchlist-store";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";
import { getMyProfile } from "@/lib/profile";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";

/**
 * Auth state components — plain wrappers around `useCurrentUserState()`.
 *
 * With auth on, visitors are signed out until they authenticate — in the sandbox
 * live preview too, which does real sign-in. The shared dev user appears only
 * when auth is disabled (`VITE_AUTH_ENABLED=false`, the shipped default).
 * While the session is still resolving, gates that care about signed-out state
 * render nothing so there's no signed-out flash on hard reload.
 */

/** Where `RedirectToSignIn` sends signed-out visitors. Create this route. */
export const SIGN_IN_PATH = "/login";

/** Render children only when a user is present (real session, or the disabled-auth dev user). */
export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

/**
 * Render children only once we KNOW the visitor is signed out (`isPending` has
 * cleared and there is no user). Hidden while the session is still loading.
 */
export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

/**
 * Client-side redirect to the sign-in route (TanStack `<Navigate>` — NOT a full
 * `window.location` reload). A hard navigation re-bootstraps the SPA and re-runs
 * session loading, which feels like a second "Loading…" on /login.
 *
 * Guard routes by waiting out `isPending` first (see `use-current-user`), then
 * render this.
 */
export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

/**
 * Minimal signed-in identity chip + sign-out. Restyle freely (see the
 * `design-ui` skill). Sign-out is only shown when auth is enabled (the
 * disabled-auth dev user has nothing to sign out of).
 */
const AVATAR_CACHE_KEY = "tsuzuku-avatar-cache";

function readAvatarCache(userId: string): { url: string | null; name: string | null } | null {
  try {
    const raw = localStorage.getItem(AVATAR_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; url?: string | null; name?: string | null };
    if (parsed.userId !== userId) return null;
    return { url: parsed.url ?? null, name: parsed.name ?? null };
  } catch {
    return null;
  }
}

export function writeAvatarCache(userId: string, url: string | null, name: string | null) {
  try {
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify({ userId, url, name }));
  } catch {
    /* quota */
  }
}

export function UserButton() {
  const user = useCurrentUser();
  // Sign-out can take a moment (and can fail when deployed), so the control
  // shows it is working and cannot be fired twice.
  const [signingOut, setSigningOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const cached = readAvatarCache(user.id);
    if (cached) {
      setAvatarUrl(cached.url);
      setDisplayName(cached.name);
    } else if (user.profileImageUrl) {
      setAvatarUrl(user.profileImageUrl);
    }
    let cancelled = false;
    void getMyProfile()
      .then((p) => {
        if (cancelled) return;
        setAvatarUrl(p.avatarUrl);
        setDisplayName(p.displayName);
        writeAvatarCache(user.id, p.avatarUrl, p.displayName);
      })
      .catch(() => {
        /* keep session/cache avatar */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.profileImageUrl]);

  if (!user) return null;
  const label = displayName ?? user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/profile"
        className="flex cursor-pointer items-center gap-2 rounded-full outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-lime"
        title="Mon profil"
        aria-label="Mon profil"
      >
        <ProfileAvatar name={label} src={avatarUrl || user.profileImageUrl} size="sm" />
        <span className="hidden text-sm font-medium sm:inline">{label}</span>
      </Link>
      {authEnabled && (
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            // Flush watchlist to the server BEFORE clearing the session, otherwise
            // the last debounced push is lost and the next login loads an empty list.
            void (async () => {
              try {
                await useWatchlistStore.getState().flushSync();
              } catch {
                /* still sign out — local copy remains */
              }
              useWatchlistStore.getState().resetSession();
              try {
                await signOut();
              } catch {
                setSigningOut(false);
              }
            })();
          }}
          className="cursor-pointer text-sm underline-offset-4 opacity-70 hover:underline disabled:cursor-wait disabled:no-underline"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      )}
    </div>
  );
}
