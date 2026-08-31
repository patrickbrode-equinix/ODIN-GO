/* FORCE REBUILD */
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PageGuard } from "./router/PageGuard";
import { getDefaultRouteForCurrentMode, IS_SHIFTPLANNER_MODE } from "./config/appMode";

/* Public – small, always needed immediately */
const TVFullscreen          = lazy(() => import("./components/pages/TVFullscreen"));

/* Lazy-loaded pages – code split per route */
const DisabledPage           = lazy(() => Promise.resolve({ default: () => null }));
const Dashboard              = IS_SHIFTPLANNER_MODE ? DisabledPage : lazy(() => import("./components/pages/Dashboard"));
const DashboardStatistik     = IS_SHIFTPLANNER_MODE ? DisabledPage : lazy(() => import("./components/pages/DashboardStatistik"));
const OdinLogicPage          = IS_SHIFTPLANNER_MODE ? DisabledPage : lazy(() => import("./components/pages/OdinLogicPage"));
const Shiftplan              = lazy(() => import("./components/pages/Shiftplan"));
const ShiftplanDrafts        = lazy(() => import("./components/pages/ShiftplanDrafts"));
const WellbeingStatistics    = lazy(() => import("./components/pages/WellbeingStatistics"));
const Weekplan               = lazy(() => import("./components/pages/Weekplan"));
const TagesplanungPage       = lazy(() => import("./components/pages/TagesplanungPage"));
const Handover               = IS_SHIFTPLANNER_MODE ? DisabledPage : lazy(() => import("./components/pages/Handover"));
const Tickets                = IS_SHIFTPLANNER_MODE ? DisabledPage : lazy(() => import("./components/pages/Tickets"));
const TVDashboard            = lazy(() => import("./components/pages/TVDashboard"));
const Dispatcher             = IS_SHIFTPLANNER_MODE ? DisabledPage : lazy(() => import("./components/pages/Dispatcher"));
const Settings               = lazy(() => import("./components/pages/Settings"));
const Users                  = lazy(() => import("./components/pages/Users"));
const CommitCompliance       = IS_SHIFTPLANNER_MODE ? DisabledPage : lazy(() => import("./components/pages/CommitCompliance"));
const TeamsCommunicationCenter = lazy(() => import("./components/pages/TeamsCommunicationCenter"));
const AdminSettings          = lazy(() => import("./components/pages/AdminSettings"));
const ShiftplanControlCenter = lazy(() => import("./components/pages/ShiftplanControlCenter"));
const UserPreferencesPage    = lazy(() => import("./components/pages/UserPreferencesPage"));
const JarvisNotifications    = lazy(() => import("./components/pages/JarvisNotifications"));
const ProjectsPage           = lazy(() => import("./components/pages/ProjectsPage"));
const OdinGoWorkspace        = lazy(() => import("./components/pages/OdinGoWorkspace"));

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
  const defaultRoute = getDefaultRouteForCurrentMode();

  return (
    <Router>
      <ExtensionNavigationBridge />
      <Suspense fallback={<PageLoader />}>
      <Routes>

        {/* ========================= */}
        {/* PUBLIC ROUTES             */}
        {/* ========================= */}
        <Route path="/tv-fullscreen" element={<TVFullscreen />} />
        <Route path="/odin-go/*" element={<OdinGoWorkspace />} />

        {/* ========================= */}
        {/* PUBLIC TV DASHBOARD       */}
        {/* kiosk-ready, no auth      */}
        {/* ========================= */}
        <Route path="/tv-dashboard" element={<TVDashboard />} />

        {/* ========================= */}
        {/* AUTHENTICATED ONLY        */}
        {/* ========================= */}
          {/* ========================= */}
          {/* MAIN APP (with Layout)   */}
          {/* ========================= */}
          <Route element={<Layout />}>

            {/* Default */}
            <Route index element={<Navigate to={defaultRoute} replace />} />

            {/* Core */}
            {!IS_SHIFTPLANNER_MODE && (
              <>
                <Route
                  path="dashboard"
                  element={
                    <PageGuard pageKey="dashboard">
                      <Dashboard />
                    </PageGuard>
                  }
                />

                <Route
                  path="dashboard/statistiken"
                  element={
                    <PageGuard pageKey="dashboard">
                      <DashboardStatistik />
                    </PageGuard>
                  }
                />

                <Route
                  path="dashboard/ticket-audit"
                  element={<Navigate to="/dashboard/statistiken" replace />}
                />
              </>
            )}

            <Route
              path="shiftplan"
              element={
                <PageGuard pageKey="shiftplan">
                  <Shiftplan />
                </PageGuard>
              }
            />

            <Route
              path="drafts"
              element={
                <PageGuard pageKey="shiftplan_drafts">
                  <ShiftplanDrafts />
                </PageGuard>
              }
            />

            <Route
              path="wellbeing"
              element={
                <PageGuard pageKey="wellbeing">
                  <WellbeingStatistics />
                </PageGuard>
              }
            />

            <Route path="jarvis-notifications" element={<JarvisNotifications />} />
            <Route path="projects" element={<ProjectsPage />} />

            <Route
              path="shiftplan/week"
              element={
                <PageGuard pageKey="shiftplan">
                  <Weekplan />
                </PageGuard>
              }
            />

            <Route
              path="shiftplan/day"
              element={
                <PageGuard pageKey="shiftplan">
                  <TagesplanungPage />
                </PageGuard>
              }
            />

            <Route
              path="tagesplanung"
              element={
                <PageGuard pageKey="shiftplan">
                  <TagesplanungPage />
                </PageGuard>
              }
            />

            {!IS_SHIFTPLANNER_MODE && (
              <>
                <Route
                  path="handover"
                  element={
                    <PageGuard pageKey="handover">
                      <Handover />
                    </PageGuard>
                  }
                />

                <Route
                  path="tickets"
                  element={
                    <PageGuard pageKey="tickets">
                      <Tickets />
                    </PageGuard>
                  }
                />
              </>
            )}

            {/* Dashboards */}
            <Route
              path="commit-dashboard"
              element={<Navigate to={defaultRoute} replace />}
            />

            {/* tv-dashboard is handled above without the main layout */}

            {/* Tools */}
            <Route
              path="dispatcher"
              element={
                <PageGuard pageKey="dispatcher_console">
                  <Dispatcher />
                </PageGuard>
              }
            />

            <Route
              path="settings"
              element={IS_SHIFTPLANNER_MODE ? <Navigate to="/preferences" replace /> :
                <PageGuard pageKey="settings">
                  <Settings />
                </PageGuard>
              }
            />

            {/* New Pages */}
            {/* DBS (Colo 2.0) → redirects to CAR */}
            <Route
              path="dbs/*"
              element={<Navigate to={defaultRoute} replace />}
            />

            <Route
              path="preferences"
              element={
                <PageGuard pageKey="settings">
                  <UserPreferencesPage />
                </PageGuard>
              }
            />
            <Route
              path="car-liste"
              element={<Navigate to={defaultRoute} replace />}
            />
            <Route
              path="protokoll"
              element={<Navigate to="/admin-settings?section=audit" replace />}
            />
            <Route
              path="protokoll/teams-benachrichtigungen"
              element={<Navigate to="/admin-settings?section=teams" replace />}
            />
            <Route
              path="protokoll/automated-assignment"
              element={<Navigate to="/admin-settings?section=odin" replace />}
            />

            {!IS_SHIFTPLANNER_MODE && (
              <Route
                path="commit-compliance"
                element={
                  <PageGuard pageKey="commit_compliance">
                    <CommitCompliance />
                  </PageGuard>
                }
              />
            )}

            {/* ODIN-Logik */}
            {!IS_SHIFTPLANNER_MODE && (
              <Route
                path="odin-logic"
                element={
                  <PageGuard pageKey="odin_logic">
                    <OdinLogicPage />
                  </PageGuard>
                }
              />
            )}

            {/* Legacy ODIN rules route redirected into Admin Settings */}
            <Route
              path="odin-logic/rules"
              element={<Navigate to="/admin-settings?section=odin" replace />}
            />

            {/* Shiftplan Control Center */}
            <Route
              path="shiftplan-control"
              element={
                <PageGuard pageKey="shiftplan_control" min="write">
                  <ShiftplanControlCenter />
                </PageGuard>
              }
            />

            {/* Shift Admin Settings moved into Admin Settings */}
            <Route
              path="shift-admin-settings"
              element={<Navigate to="/admin-settings?section=shiftplan" replace />}
            />

            {/* Teams Communication Center */}
            <Route
              path="teams-center"
              element={
                <PageGuard pageKey="teams_center">
                  <TeamsCommunicationCenter />
                </PageGuard>
              }
            />

            {/* Admin Settings */}
            <Route
              path="admin-settings"
              element={
                <PageGuard
                  pageKey="admin_settings"
                  anyOf={IS_SHIFTPLANNER_MODE ? undefined : [
                    { pageKey: "teams_center" },
                    { pageKey: "shiftplan_control" },
                    { pageKey: "odin_logic" },
                    { pageKey: "protokoll" },
                  ]}
                >
                  <AdminSettings />
                </PageGuard>
              }
            />

            {/* Admin */}
            <Route
              path="users"
              element={
                <PageGuard pageKey="user_management">
                  <Users />
                </PageGuard>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to={defaultRoute} replace />} />

          </Route>
      </Routes>
      </Suspense>
    </Router>
  );
}
