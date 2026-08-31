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
