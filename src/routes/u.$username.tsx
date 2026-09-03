import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { getProfileByUsername, type PublicProfile } from "@/lib/profile";

export const Route = createFileRoute("/u/$username")({
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const { username } = Route.useParams();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProfile(undefined);
    setError("");
    void getProfileByUsername({ data: { username } })
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
          setProfile(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line px-4 py-4 sm:px-7">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            to="/"
            className="rounded-[8px] border border-line bg-raised p-2 text-dim hover:text-ink"
            aria-label="Accueil"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="font-serif text-lg font-semibold">Profil</div>
            <div className="text-xs text-dim">@{username}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-7">
        {profile === undefined ? (
          <div className="flex justify-center py-16 text-dim">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : null}

        {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}

        {profile === null && !error ? (
          <div className="py-16 text-center">
            <p className="font-serif text-xl font-medium">Profil introuvable</p>
            <p className="mt-2 text-sm text-dim">
              Ce pseudo n&apos;existe pas, ou le profil est privé.
            </p>
            <Link to="/profile" className="mt-4 inline-block text-sm font-semibold text-lime">
              Chercher un autre profil
            </Link>
          </div>
        ) : null}

        {profile ? (
          <div className="rounded-[14px] border border-line bg-raised p-6 text-center sm:p-8">
            <div className="flex justify-center">
              <ProfileAvatar name={profile.displayName} src={profile.avatarUrl} size="xl" />
            </div>
            <h1 className="font-serif mt-4 text-2xl font-semibold">{profile.displayName}</h1>
            <p className="text-sm text-dim">@{profile.username}</p>
            {profile.bio ? (
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink/90">
                {profile.bio}
              </p>
            ) : null}
            <p className="mt-5 text-sm text-dim">
              {profile.listCount ?? 0} titre
              {(profile.listCount || 0) > 1 ? "s" : ""} dans la watchlist
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
