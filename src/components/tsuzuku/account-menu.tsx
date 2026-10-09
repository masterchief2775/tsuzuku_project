import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, LogOut, Settings } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useWatchlistStore } from "@/store/watchlist-store";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getMyProfile } from "@/lib/profile";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";

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

/**
 * Single "account" entry point in the header: avatar button opening the
 * profile / public profile / sign-out menu. Replaces the old avatar link +
 * display name + standalone sign-out button trio, so the header cluster is
 * bell + theme + account (+ list actions) instead of six controls.
 */
export function AccountMenu() {
  const user = useCurrentUser();
  // Sign-out can take a moment (and can fail when deployed), so the control
  // shows it is working and cannot be fired twice.
  const [signingOut, setSigningOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

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
        setUsername(p.username);
      })
      .catch(() => {
        /* keep session/cache avatar */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.profileImageUrl]);

  if (!user) return null;
  const label = displayName ?? user.displayName ?? user.primaryEmail ?? "Compte";

  const doSignOut = () => {
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
  };

  // Non-modal: a modal dropdown locks body scroll and compensates with a
  // padding-right, which visibly shoves the whole centered page left.
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="rounded-full outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-lime"
          aria-label={`Compte : ${label}`}
          title="Compte"
        >
          <ProfileAvatar name={label} src={avatarUrl || user.profileImageUrl} size="sm" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[240px] rounded-[12px] border border-line bg-raised p-1.5 shadow-xl"
        >
          <div className="px-2.5 py-2">
            <div className="truncate text-sm font-semibold">{label}</div>
            <div className="truncate text-xs text-dim">
              {username ? `@${username}` : (user.primaryEmail ?? "")}
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild>
            <Link
              to="/profile"
              className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm outline-none hover:bg-bg focus:bg-bg"
            >
              <Settings className="size-4 text-dim" />
              Mon profil
            </Link>
          </DropdownMenu.Item>
          {username ? (
            <DropdownMenu.Item asChild>
              <Link
                to="/u/$username"
                params={{ username }}
                className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm outline-none hover:bg-bg focus:bg-bg"
              >
                <Eye className="size-4 text-dim" />
                Profil public
              </Link>
            </DropdownMenu.Item>
          ) : null}
          {authEnabled ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item
                disabled={signingOut}
                onSelect={doSignOut}
                className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm text-crimson outline-none hover:bg-bg focus:bg-bg disabled:cursor-wait disabled:opacity-60"
              >
                <LogOut className="size-4" />
                {signingOut ? "Déconnexion…" : "Déconnexion"}
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
