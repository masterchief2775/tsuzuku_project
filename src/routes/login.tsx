import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Loader2, LogIn, UserPlus } from "lucide-react";
import { authClient, authEnabled, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BrandMark } from "@/components/tsuzuku/brand-mark";
import { AppFooter } from "@/components/tsuzuku/app-footer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({ component: LoginPage });

type Mode = "login" | "signup";

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setMessage(null);
  }, [mode]);

  if (!isPending && user) return <Navigate to="/" />;

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    setError(null);
    setMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("Entre ton adresse e-mail et ton mot de passe.");
      return;
    }

    if (mode === "signup") {
      if (!name.trim()) {
        setError("Entre ton nom ou ton pseudo.");
        return;
      }
      if (password.length < 8) {
        setError("Le mot de passe doit contenir au moins 8 caractères.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Les mots de passe ne correspondent pas.");
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: signUpError } = await authClient.signUp.email({
          name: name.trim(),
          email: normalizedEmail,
          password,
        });
        if (signUpError) throw new Error(signUpError.message ?? "Inscription impossible");
        setMessage("Compte créé. Connexion en cours…");
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email: normalizedEmail,
          password,
          callbackURL: "/",
        });
        if (signInError) throw new Error(signInError.message ?? "Connexion impossible");
      }
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setBusy(false);
    }
  }

  async function handleProvider(providerId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(providerId, { callbackURL: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
      setBusy(false);
    }
  }

  if (!authEnabled) {
    return (
      <main className="flex min-h-dvh flex-col items-center bg-bg px-4 text-ink">
        <div className="ui-panel w-full max-w-md p-7 text-center">
          <BrandMark className="mx-auto" />
          <h1 className="font-serif text-3xl font-semibold">Tsuzuku</h1>
          <p className="mt-2 text-sm text-dim">La connexion est désactivée.</p>
        </div>
        <AppFooter />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 py-8 text-ink">
      <div className="my-auto w-full max-w-md">
        <div className="mb-7 text-center">
          <BrandMark className="mx-auto" />
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Tsuzuku</h1>
          <p className="mt-2 text-sm text-dim">Ta watchlist, en continu.</p>
        </div>

        <section className="ui-panel p-5 sm:p-7">
          <div className="mb-5 grid grid-cols-2 rounded-[10px] bg-bg p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={cn("flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition", mode === "login" ? "bg-ink text-bg" : "text-dim hover:text-ink")}
            >
              <LogIn className="size-4" /> Connexion
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={cn("flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition", mode === "signup" ? "bg-ink text-bg" : "text-dim hover:text-ink")}
            >
              <UserPlus className="size-4" /> Inscription
            </button>
          </div>

          <div className="space-y-2">
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                disabled={busy}
                onClick={() => void handleProvider(provider.providerId)}
                className="flex w-full items-center justify-between rounded-[12px] border border-line bg-bg px-4 py-3 text-sm font-semibold transition hover:border-lime/40 hover:bg-ink/5 disabled:cursor-wait disabled:opacity-60"
              >
                <span>Continuer avec {provider.label}</span>
                <ArrowRight className="size-4" />
              </button>
            ))}
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-dim">
            <div className="h-px flex-1 bg-line" />
            <span>ou avec ton e-mail</span>
            <div className="h-px flex-1 bg-line" />
          </div>

          <form className="space-y-3.5" onSubmit={(ev) => void submit(ev)}>
            {mode === "signup" && (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-dim">Nom ou pseudo</span>
                <input
                  value={name}
                  onChange={(ev) => setName(ev.target.value)}
                  autoComplete="name"
                  className="w-full rounded-[10px] border border-line bg-bg px-3.5 py-3 text-sm outline-none transition focus:border-ink/40"
                  placeholder="Ton pseudo"
                />
              </label>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-dim">E-mail</span>
              <input
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                type="email"
                autoComplete="email"
                className="w-full rounded-[10px] border border-line bg-bg px-3.5 py-3 text-sm outline-none transition focus:border-ink/40"
                placeholder="toi@example.com"
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-dim">Mot de passe</span>
              <div className="relative">
                <input
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="ui-input pr-11"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-dim hover:text-ink"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {mode === "signup" && (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-dim">Confirmer le mot de passe</span>
                <input
                  value={confirmPassword}
                  onChange={(ev) => setConfirmPassword(ev.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full rounded-[10px] border border-line bg-bg px-3.5 py-3 text-sm outline-none transition focus:border-ink/40"
                  placeholder="••••••••"
                  required
                />
              </label>
            )}

            {error && (
              <div className="rounded-[10px] border border-red-500/20 bg-red-500/5 px-3.5 py-3 text-sm text-red-700">{error}</div>
            )}
            {message && (
              <div className="rounded-[10px] border border-lime/30 bg-lime/10 px-3.5 py-3 text-sm">{message}</div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="ui-button-primary disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "login" ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
              {mode === "login" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs leading-5 text-dim">
            {mode === "login" ? "Pas encore de compte ? " : "Tu as déjà un compte ? "}
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="font-semibold text-ink underline underline-offset-4"
            >
              {mode === "login" ? "Inscris-toi" : "Connecte-toi"}
            </button>
          </p>
        </section>
      </div>
      <AppFooter />
    </main>
  );
}
