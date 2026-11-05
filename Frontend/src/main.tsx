/* ------------------------------------------------ */
/* MAIN ENTRYPOINT                                 */
/* ------------------------------------------------ */
import ReactDOM from "react-dom/client";

/* ------------------------------------------------ */
/* GLOBAL STYLES                                   */
/* ------------------------------------------------ */
import "./styles/globals.css";

/* ------------------------------------------------ */
/* ROOT APP + PROVIDERS                            */
/* ------------------------------------------------ */
import App from "./App";
import { ThemeProvider } from "./components/ThemeProvider";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/ui/sonner";

/* ------------------------------------------------ */
/* STALE DEPLOY: reload once when a lazy chunk is gone */
/* ------------------------------------------------ */
// After a new deployment the open browser tab still points to chunk files of the old build
// ("Failed to fetch dynamically imported module"). One automatic reload loads the new index.html.
window.addEventListener("vite:preloadError", (event) => {
  try {
    const key = "odin-chunk-reload";
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last > 30000) {
      sessionStorage.setItem(key, String(Date.now()));
      event.preventDefault();
      window.location.reload();
    }
  } catch {
    /* storage unavailable: fall through to the error boundary */
  }
});

/* ------------------------------------------------ */
/* RENDER APPLICATION                              */
/* ------------------------------------------------ */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <LanguageProvider>
          <App />
          <Toaster />
        </LanguageProvider>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
);
