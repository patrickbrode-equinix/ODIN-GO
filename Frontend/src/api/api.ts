import axios from "axios";

export function normalizeApiBaseUrl(raw?: string): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return "/api";
  if (value === "/api" || value.endsWith("/api")) return value;
  return `${value}/api`;
}

export const api = axios.create({
  baseURL: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  headers: {
    "Content-Type": "application/json",
  },
});

export function getNetworkSettings() {
  return {
    baseUrl: localStorage.getItem("shiftplanner_vm_url") || "",
    apiKey: localStorage.getItem("shiftplanner_vm_key") || "",
  };
}

api.interceptors.request.use((request) => {
  const adminToken = sessionStorage.getItem("shiftplanner_admin_token");
  const identityToken = sessionStorage.getItem("shiftplanner_identity_token");
  const network = getNetworkSettings();
  const apiKey = network.apiKey || sessionStorage.getItem("shiftplanner_api_key");
  if (network.baseUrl) request.baseURL = normalizeApiBaseUrl(network.baseUrl);
  if (adminToken) request.headers["x-shiftplanner-admin"] = adminToken;
  if (identityToken) request.headers["x-shiftplanner-identity"] = identityToken;
  if (apiKey) request.headers["x-shiftplanner-key"] = apiKey;
  return request;
});

api.interceptors.response.use(
  (response) => {
    const contentType = response.headers?.["content-type"] || "";
    if (contentType.includes("text/html") || detectHtml(response.data)) {
      const url = response.config?.url || "unknown";
      console.error(
        `[Shiftplanner][API] HTML returned instead of JSON for ${url}. ` +
        `Check VITE_API_BASE_URL (current baseURL: ${response.config?.baseURL}).`,
      );
      return Promise.reject(new Error(`API returned HTML instead of JSON for ${url}`));
    }
    return response;
  },
  (error) => {
    if (isJarvisIdentityError(error?.response?.status, error?.response?.data)) {
      sessionStorage.removeItem("shiftplanner_identity_token");
    }
    if (isAdminSessionError(error?.response?.status, error?.response?.data)) {
      sessionStorage.removeItem("shiftplanner_admin_token");
      window.dispatchEvent(new Event("shiftplanner-admin-session-expired"));
    }
    return Promise.reject(error);
  },
);

export function isAdminSessionError(status: unknown, data: any): boolean {
  return status === 401 && String(data?.code || "") === "ADMIN_SESSION_EXPIRED";
}

export function isJarvisIdentityError(status: unknown, data: any): boolean {
  if (status !== 401) return false;
  const code = String(data?.code || "");
  const message = String(data?.message || "");
  return code === "JARVIS_IDENTITY_REQUIRED" || /Jarvis.*Identit/i.test(message);
}

export function detectHtml(data: any): boolean {
  return typeof data === "string" && (data.includes("<!doctype html") || data.includes("<html"));
}

export function asArray(data: any, context: string): any[] {
  if (Array.isArray(data)) return data;

  if (detectHtml(data)) {
    console.error(`[Shiftplanner][API] HTML returned instead of JSON in ${context}.`);
  } else {
    console.warn(`[Shiftplanner][API] Non-array data returned in ${context}.`, { type: typeof data });
  }
  return [];
}

export function asObject(data: any, context: string): Record<string, any> {
  if (typeof data === "object" && data !== null && !Array.isArray(data)) return data;

  if (detectHtml(data)) {
    console.error(`[Shiftplanner][API] HTML returned instead of JSON in ${context}.`);
  } else {
    console.warn(`[Shiftplanner][API] Non-object data returned in ${context}.`, { type: typeof data });
  }
  return {};
}
