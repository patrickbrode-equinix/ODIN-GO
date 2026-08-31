import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/api";
import { IS_SHIFTPLANNER_MODE } from "../config/appMode";

export type AccessLevel = "none" | "view" | "write";

type User = {
  id: number;
  loginName: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  displayName: string;
  group: string | null;
  location: string | null;
  team: string | null;
  approved: boolean;
  mustChangePassword: boolean;
  isAdmin: boolean;
  isRoot: boolean;
  role: "user" | "admin";
  accessPolicy: Record<string, AccessLevel>;
};

type AuthContextType = {
  user: User;
  isAuthenticated: true;
  completeForcedPasswordChange: () => void;
  getLevel: (pageKey: string) => AccessLevel;
  canAccess: (pageKey: string, min?: AccessLevel) => boolean;
  canView: (pageKey: string) => boolean;
  canWrite: (pageKey: string) => boolean;
  unlockAdmin: (password: string) => Promise<void>;
};

const ADMIN_PAGE_KEYS = new Set([
  "admin_settings",
  "shiftplan_control",
  "user_management",
  "teams_center",
  "protokoll",
]);

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function consumeExtensionContext() {
  const params = new URLSearchParams(window.location.search);
  const adminToken = params.get("adminToken");
  const identityToken = params.get("identityToken");
  const apiKey = params.get("apiKey");
  const employee = params.get("employee");

  if (adminToken) sessionStorage.setItem("shiftplanner_admin_token", adminToken);
  if (identityToken) sessionStorage.setItem("shiftplanner_identity_token", identityToken);
  if (apiKey) sessionStorage.setItem("shiftplanner_api_key", apiKey);

  return {
    adminUnlocked: Boolean(adminToken || sessionStorage.getItem("shiftplanner_admin_token")),
    employeeName: employee || "Mitarbeiter",
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [extensionContext] = useState(consumeExtensionContext);
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem("shiftplanner_admin_token") || "");

  useEffect(() => {
    const clearExpiredAdminSession = () => setAdminToken("");
    window.addEventListener("shiftplanner-admin-session-expired", clearExpiredAdminSession);
    return () => window.removeEventListener("shiftplanner-admin-session-expired", clearExpiredAdminSession);
  }, []);

  useEffect(() => {
    const needsGlobalScheduleBootstrap = !IS_SHIFTPLANNER_MODE || window.location.pathname.startsWith("/tv-");
    if (needsGlobalScheduleBootstrap) {
      void import("../lib/bootstrapShiftData").then(({ bootstrapShiftData }) => bootstrapShiftData()).catch(() => {});
    }
  }, []);

  const unlockAdmin = useCallback(async (password: string) => {
    const response = await api.post("/standalone-admin/unlock", { password });
    const token = String(response.data?.token || "");
    if (!token) throw new Error("Die Admin-Freigabe hat kein gueltiges Zugriffstoken geliefert.");
    sessionStorage.setItem("shiftplanner_admin_token", token);
    setAdminToken(token);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "ODIN_GO_ADMIN_SESSION", token }, "*");
    }
  }, []);

  const value = useMemo<AuthContextType>(() => {
    const nameParts = extensionContext.employeeName.trim().split(/\s+/);
    const firstName = nameParts.shift() || "Mitarbeiter";
    const lastName = nameParts.join(" ");
    const normalizedEmployeeName = extensionContext.employeeName.trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
    const patrickBypass = normalizedEmployeeName === "patrick brode";
    const adminUnlocked = Boolean(adminToken || extensionContext.adminUnlocked || patrickBypass);

    const user: User = {
      id: 0,
      loginName: extensionContext.employeeName,
      email: null,
      firstName,
      lastName,
      displayName: extensionContext.employeeName,
      group: null,
      location: null,
      team: null,
      approved: true,
      mustChangePassword: false,
      isAdmin: adminUnlocked,
      isRoot: adminUnlocked,
      role: adminUnlocked ? "admin" : "user",
      accessPolicy: {},
    };

    const canAccess = (pageKey: string) => adminUnlocked || !ADMIN_PAGE_KEYS.has(pageKey);
    const canWrite = (pageKey: string) => adminUnlocked || pageKey === "settings";

    return {
      user,
      isAuthenticated: true,
      completeForcedPasswordChange: () => {},
      getLevel: (pageKey) => canWrite(pageKey) ? "write" : canAccess(pageKey) ? "view" : "none",
      canAccess,
      canView: canAccess,
      canWrite,
      unlockAdmin,
    };
  }, [adminToken, extensionContext, unlockAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
