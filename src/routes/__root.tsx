import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "Tsuzuku";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "Gère ta watchlist d'anime — progression, notes, export." },
      { name: "theme-color", content: "#14161F" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Manrope:wght@500;600;700;800&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("tsuzuku-theme");var raw=localStorage.getItem("tsuzuku-secret-themes")||"[]";var unlocked={};try{var arr=JSON.parse(raw);for(var i=0;i<arr.length;i++)unlocked[arr[i]]=true;}catch(e){}if(localStorage.getItem("tsuzuku-secret-theme")==="true")unlocked.void=true;var valid={dark:1,light:1,sakura:1,ocean:1,void:1,ember:1,neon:1,aurora:1,manga:1,mono:1};if((t==="void"||t==="ember"||t==="neon"||t==="aurora"||t==="manga"||t==="mono")&&!unlocked[t])t="dark";if(valid[t])document.documentElement.setAttribute("data-theme",t);else document.documentElement.setAttribute("data-theme","dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`,
          }}
        />
      </head>
      <body className="bg-bg text-ink antialiased">
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
