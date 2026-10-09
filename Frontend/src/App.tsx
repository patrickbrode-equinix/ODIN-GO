import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import StandaloneWebLogin from "./components/StandaloneWebLogin";
import { useAuth } from "./context/AuthContext";

/* Public – small, always needed immediately */
const OdinGoWorkspace = lazy(() => import("./components/pages/OdinGoWorkspace"));

/* The shift plan is the landing page of the extension: load its chunk in parallel with the
 * workspace shell instead of after it (removes one network round trip from every open). */
if (typeof window !== "undefined" && /^\/odin-go\/shiftplan\/?$/.test(window.location.pathname)) {
  void import("./components/pages/Shiftplan");
}

/*
 * Both access paths use the same UI: the ODIN GO workspace.
 *  - Jarvis extension: iframe with ?embed=1
 *  - Web access (managers): same workspace behind the admin-password login
 */
const WORKSPACE_HOME = "/odin-go/shiftplan";

/* Old standalone-shell URLs → matching workspace tab (bookmarks keep working). */
const LEGACY_REDIRECTS: Array<[string, string]> = [
  ["shiftplan", "/odin-go/shiftplan"],
  ["shiftplan/week", "/odin-go/week"],
  ["shiftplan/day", "/odin-go/day"],
  ["tagesplanung", "/odin-go/day"],
  ["drafts", "/odin-go/drafts"],
  ["projects", "/odin-go/projects"],
  ["jarvis-notifications", "/odin-go/notifications"],
  ["preferences", "/odin-go/preferences"],
  ["admin-settings", "/odin-go/admin-settings"],
  ["shiftplan-control", "/odin-go/generator"],
  ["users", "/odin-go/users"],
  ["wellbeing", "/odin-go/admin-settings?section=wellbeing"],
];

/* Redirect that keeps the query string (embed=1, extension tokens) intact. */
function RedirectKeepSearch({ to }: { to: string }) {
  const { search } = useLocation();
  const [path, ownQuery] = to.split("?");
  const merged = new URLSearchParams(search);
  new URLSearchParams(ownQuery || "").forEach((value, key) => merged.set(key, value));
  const query = merged.toString();
  return <Navigate to={query ? `${path}?${query}` : path} replace />;
}

function ProtectedOdinGoWorkspace() {
  const { webLoginRequired } = useAuth();
  return webLoginRequired ? <StandaloneWebLogin /> : <OdinGoWorkspace />;
}

/* Loading fallback */
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-50">
      <div className="w-6 h-6 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
    </div>
  );
}

function ExtensionNavigationBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "https://jarvis-emea.equinix.com" || event.data?.type !== "ODIN_GO_NAVIGATE") return;
      const target = String(event.data?.path || "");
      if (!target.startsWith("/") || target.startsWith("//")) return;
      navigate(target);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <Router>
      <ExtensionNavigationBridge />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/odin-go/*" element={<ProtectedOdinGoWorkspace />} />

          {LEGACY_REDIRECTS.map(([from, to]) => (
            <Route key={from} path={from} element={<RedirectKeepSearch to={to} />} />
          ))}

          <Route path="*" element={<RedirectKeepSearch to={WORKSPACE_HOME} />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
