const ROLE_ORDER = {
  user: 1,
  admin: 2,
};

const ACCESS_LEVELS = {
  none: 0,
  view: 1,
  write: 2,
};

function normalizeAccessLevel(rawLevel) {
  if (rawLevel === "view" || rawLevel === "write") {
    return rawLevel;
  }
  return "none";
}

function sanitizeAccessOverride(accessOverride = {}) {
  const next = {};

  for (const [pageKey, rawLevel] of Object.entries(accessOverride || {})) {
    next[pageKey] = normalizeAccessLevel(rawLevel);
  }

  return next;
}

export const ROLE_POLICIES = {
  user: {
    dashboard: "write",
    shiftplan: "write",
    handover: "write",
    tickets: "view",
    commit_dashboard: "view",
    dispatcher_console: "view",
    tv_dashboard: "none",
    odin_logic: "view",
    settings: "write",
    user_management: "none",
    ticket_audit: "none",
    protokoll: "view",
    commit_compliance: "write",
    shiftplan_control: "none",
    teams_center: "none",
    admin_settings: "none",
  },
  admin: {
    dashboard: "write",
    shiftplan: "write",
    handover: "write",
    tickets: "write",
    commit_dashboard: "write",
    dispatcher_console: "write",
    tv_dashboard: "write",
    odin_logic: "write",
    settings: "write",
    user_management: "write",
    ticket_audit: "write",
    protokoll: "write",
    commit_compliance: "write",
    shiftplan_control: "write",
    teams_center: "write",
    admin_settings: "write",
  },
};

export function normalizeRole(rawRole) {
  return rawRole === "admin" ? "admin" : "user";
}

export function resolveUserRole(user) {
  if (user?.is_root === true || user?.is_admin === true) {
    return "admin";
  }
  return "user";
}

export function getRolePolicy(role) {
  return ROLE_POLICIES[normalizeRole(role)];
}

export function getAccessLevelForRole(role, pageKey) {
  const policy = getRolePolicy(role);
  return policy[pageKey] || "none";
}

export function canRoleAccess(role, pageKey, minLevel = "view") {
  const current = getAccessLevelForRole(role, pageKey);
  return ACCESS_LEVELS[current] >= ACCESS_LEVELS[minLevel];
}

export function buildBaseAccessPolicy(role) {
  const policy = getRolePolicy(role) || {};
  return { ...policy };
}

export function applyAccessOverride(basePolicy, accessOverride = {}) {
  return {
    ...(basePolicy || {}),
    ...sanitizeAccessOverride(accessOverride),
  };
}

export function buildAccessPolicy(role, accessOverride = {}) {
  return applyAccessOverride(buildBaseAccessPolicy(role), accessOverride);
}

export function isAdminRole(role) {
  return ROLE_ORDER[normalizeRole(role)] >= ROLE_ORDER.admin;
}