import crypto from "node:crypto";
import pool from "../db.js";
import { normalizeName } from "../lib/nameNorm.js";
import {
  buildNameKeyFromParts,
  buildShortNameKeyFromParts,
  buildUsernameBase,
  areEquivalentEmployeeNames,
  chooseCanonicalEmployeeName,
  generateEmailFromName,
  normalizeEmployeeIdentity,
  isEmailLike,
  splitEmployeeName,
} from "../lib/employeeIdentity.js";
import { normalizeLoginNameForLookup } from "../lib/loginName.js";

const DEFAULT_GROUP = "c-ops";
const DEFAULT_IBX = "FR2";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function buildExistingUserName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
}

function buildCandidate(employee) {
  const employeeName = employee.employeeName ?? employee.employee_name ?? employee.displayName ?? employee.display_name ?? employee.name;
  const sourceKind = isEmailLike(employeeName) ? "email" : "name";
  const identity = normalizeEmployeeIdentity({
    ...employee,
    employeeName,
    upn: employee.upn || employee.userPrincipalName || employee.email || (sourceKind === "email" ? employeeName : ""),
    displayName: employee.displayName || employee.display_name || employeeName,
  });
  const parts = splitEmployeeName(employeeName);
  if (!parts) return null;

  const sourceEmail = identity.upn || employee.email || (sourceKind === "email" ? employeeName : "");
  const preferredEmail = normalizeEmail(sourceEmail || generateEmailFromName(parts.displayName));
  const preferredLoginName = preferredEmail;
  const usernameBase = buildUsernameBase(parts.firstName, parts.lastName);
  const fullNameKey = buildNameKeyFromParts(parts.firstName, parts.lastName);
  const shortNameKey = buildShortNameKeyFromParts(parts.firstName, parts.lastName);

  if (!preferredLoginName || !preferredEmail || !usernameBase || !fullNameKey) return null;

  return {
    employeeName,
    displayName: parts.displayName,
    firstName: parts.firstName,
    lastName: parts.lastName,
    employeeKey: identity.employeeKey,
    stableIdentity: Boolean(identity.entraObjectId || identity.employeeId || identity.upn),
    entraObjectId: identity.entraObjectId,
    employeeId: identity.employeeId,
    upn: identity.upn,
    sourceKind,
    preferredLoginName,
    preferredEmail,
    usernameBase,
    fullNameKey,
    shortNameKey,
  };
}

function isEquivalentSeenCandidate(candidate, seenCandidates) {
  return seenCandidates.some((seen) => {
    if (candidate.employeeKey && seen.employeeKey && candidate.employeeKey === seen.employeeKey) {
      return true;
    }

    if (candidate.preferredEmail && seen.preferredEmail && candidate.preferredEmail === seen.preferredEmail) {
      return true;
    }

    return false;
  });
}

function buildExistingIndexes(existingUsers) {
  const byLoginName = new Map();
  const byEmail = new Map();
  const byEmployeeKey = new Map();
  const byName = new Map();
  const byShortName = new Map();
  const usedLoginNames = new Set();
  const usedEmails = new Set();
  const usedUsernames = new Set();

  for (const user of existingUsers) {
    const loginName = normalizeLoginNameForLookup(user.login_name);
    if (loginName) {
      byLoginName.set(loginName, user);
      usedLoginNames.add(loginName);
    }

    const email = normalizeEmail(user.email);
    if (email) {
      byEmail.set(email, user);
      usedEmails.add(email);
    }

    const username = normalizeUsername(user.username);
    if (username) usedUsernames.add(username);

    const identity = normalizeEmployeeIdentity({
      entraObjectId: user.entra_object_id,
      employeeId: user.employee_id,
      upn: user.upn || user.email,
      displayName: user.provisioned_employee_name || buildExistingUserName(user) || user.email,
    });
    if (identity.employeeKey) byEmployeeKey.set(identity.employeeKey, user);

    const fullName = buildExistingUserName(user);
    const fullNameParts = fullName ? splitEmployeeName(fullName) : null;
    if (fullNameParts) {
      const fullNameKey = buildNameKeyFromParts(fullNameParts.firstName, fullNameParts.lastName);
      const shortNameKey = buildShortNameKeyFromParts(fullNameParts.firstName, fullNameParts.lastName);
      if (fullNameKey) byName.set(fullNameKey, user);
      if (shortNameKey) byShortName.set(shortNameKey, user);
    }

    const provisionedName = normalizeName(user.provisioned_employee_name || "");
    if (provisionedName) {
      byName.set(`provisioned:${provisionedName}`, user);
    }
  }

  return {
    byLoginName,
    byEmail,
    byEmployeeKey,
    byName,
    byShortName,
    users: existingUsers,
    usedLoginNames,
    usedEmails,
    usedUsernames,
  };
}

function summarizeExistingUser(existingUser) {
  if (!existingUser) return null;

  return {
    id: existingUser.id,
    loginName: existingUser.login_name || null,
    email: existingUser.email || null,
    username: existingUser.username || null,
    displayName: buildExistingUserName(existingUser) || existingUser.email || existingUser.username || null,
    approved: existingUser.approved === true,
    isAdmin: existingUser.is_admin === true,
    isRoot: existingUser.is_root === true,
    provisionedFromShiftplan: existingUser.provisioned_from_shiftplan === true,
    provisionedEmployeeName: existingUser.provisioned_employee_name || null,
  };
}

function isCompatibleExistingUser(candidate, existingUser) {
  if (!existingUser) return false;

  const existingIdentity = normalizeEmployeeIdentity({
    entraObjectId: existingUser.entra_object_id,
    employeeId: existingUser.employee_id,
    upn: existingUser.upn || existingUser.email,
    displayName: existingUser.provisioned_employee_name || buildExistingUserName(existingUser) || existingUser.email,
  });
  if (candidate.employeeKey && existingIdentity.employeeKey === candidate.employeeKey) return true;
  if (candidate.stableIdentity && (existingIdentity.entraObjectId || existingIdentity.employeeId || existingIdentity.upn)) return false;

  const existingFullName = buildExistingUserName(existingUser);
  const existingParts = existingFullName ? splitEmployeeName(existingFullName) : null;
  const existingFullNameKey = existingParts
    ? buildNameKeyFromParts(existingParts.firstName, existingParts.lastName)
    : null;
  const existingShortNameKey = existingParts
    ? buildShortNameKeyFromParts(existingParts.firstName, existingParts.lastName)
    : null;
  const provisionedNameKey = normalizeName(existingUser.provisioned_employee_name || "");
  const candidateNameKey = normalizeName(candidate.employeeName);
  const provisionedName = existingUser.provisioned_employee_name || "";

  return provisionedNameKey === candidateNameKey
    || existingFullNameKey === candidate.fullNameKey
    || areEquivalentEmployeeNames(provisionedName, candidate.displayName);
}

function resolveExistingUserMatch(candidate, indexes) {
  const identityMatch = indexes.byEmployeeKey.get(candidate.employeeKey);
  const loginNameMatch = indexes.byLoginName.get(normalizeLoginNameForLookup(candidate.preferredLoginName));
  const emailMatch = indexes.byEmail.get(candidate.preferredEmail);
  const nameMatch = indexes.byName.get(candidate.fullNameKey)
    || indexes.byName.get(`provisioned:${normalizeName(candidate.employeeName)}`);

  if (identityMatch) {
    return { user: identityMatch, match: "employeeKey" };
  }

  if (isCompatibleExistingUser(candidate, loginNameMatch)) {
    return loginNameMatch ? { user: loginNameMatch, match: "loginName" } : null;
  }

  if (isCompatibleExistingUser(candidate, emailMatch)) {
    return emailMatch ? { user: emailMatch, match: "email" } : null;
  }

  if (nameMatch) {
    return { user: nameMatch, match: "name" };
  }

  return null;
}

function nextAvailableEmail(baseEmail, usedEmails) {
  if (!baseEmail) return null;
  if (!usedEmails.has(baseEmail)) return baseEmail;

  const [localPart, domainPart = "eu.equinix.com"] = baseEmail.split("@");
  let counter = 2;
  while (counter < 1000) {
    const candidate = `${localPart}+odin${counter}@${domainPart}`;
    if (!usedEmails.has(candidate)) return candidate;
    counter += 1;
  }

  return null;
}

function nextAvailableLoginName(baseLoginName, usedLoginNames) {
  if (!baseLoginName) return null;

  const normalizedBase = normalizeLoginNameForLookup(baseLoginName);
  if (!usedLoginNames.has(normalizedBase)) return baseLoginName;

  const [leftSide, rightSide] = baseLoginName.split("@");
  let counter = 2;
  while (counter < 1000) {
    const candidate = `${leftSide}${counter}@${rightSide}`;
    if (!usedLoginNames.has(normalizeLoginNameForLookup(candidate))) return candidate;
    counter += 1;
  }

  return null;
}

function nextAvailableUsername(baseUsername, usedUsernames) {
  if (!baseUsername) return null;
  if (!usedUsernames.has(baseUsername)) return baseUsername;

  let counter = 2;
  while (counter < 1000) {
    const candidate = `${baseUsername}${counter}`;
    if (!usedUsernames.has(candidate)) return candidate;
    counter += 1;
  }

  return null;
}

export function findExistingUserForEmployeeName(employeeName, existingUsers = []) {
  const candidate = buildCandidate({ employeeName, email: "" });
  if (!candidate) return null;

  const indexes = buildExistingIndexes(existingUsers);
  const resolved = resolveExistingUserMatch(candidate, indexes);
  if (!resolved?.user) return null;

  return {
    employeeName: candidate.employeeName,
    displayName: candidate.displayName,
    match: resolved.match,
    user: summarizeExistingUser(resolved.user),
  };
}

export function buildProvisioningAssessment({
  employees,
  existingUsers,
  defaultGroup = DEFAULT_GROUP,
  defaultIbx = DEFAULT_IBX,
}) {
  const indexes = buildExistingIndexes(existingUsers);
  const assessments = [];
  const seenCandidates = [];
  let matchedExisting = 0;

  for (const employee of employees) {
    const candidate = buildCandidate(employee);
    if (!candidate) {
      assessments.push({
        employeeName: employee.employeeName,
        action: "skip",
        reason: "invalid_name",
      });
      continue;
    }

    if (isEquivalentSeenCandidate(candidate, seenCandidates)) continue;
    seenCandidates.push(candidate);

    const resolved = resolveExistingUserMatch(candidate, indexes);
    if (resolved?.user) {
      matchedExisting += 1;

      const patch = {};
      const existingUser = resolved.user;
      const existingDisplayName = buildExistingUserName(existingUser);
      const desiredEmail = normalizeEmail(existingUser.email || candidate.preferredEmail);
      if (!existingUser.email && desiredEmail) patch.email = desiredEmail;
      if (desiredEmail && normalizeLoginNameForLookup(existingUser.login_name) !== desiredEmail) {
        patch.loginName = desiredEmail;
      }
      if (
        (!existingDisplayName || existingUser.provisioned_from_shiftplan === true)
        && existingDisplayName !== candidate.displayName
      ) {
        patch.firstName = candidate.firstName;
        patch.lastName = candidate.lastName;
      }
      if (existingUser.approved !== true) patch.approved = true;
      if (existingUser.provisioned_from_shiftplan !== true) patch.provisionedFromShiftplan = true;
      if ((existingUser.provisioned_employee_name || "") !== candidate.employeeName) {
        const canonicalProvisionedName = chooseCanonicalEmployeeName([
          existingUser.provisioned_employee_name || "",
          candidate.employeeName,
          candidate.displayName,
        ]);
        if (
          !areEquivalentEmployeeNames(existingUser.provisioned_employee_name || "", candidate.displayName)
          || canonicalProvisionedName !== existingUser.provisioned_employee_name
        ) {
          patch.provisionedEmployeeName = canonicalProvisionedName || candidate.employeeName;
        }
      }

      assessments.push({
        employeeName: candidate.employeeName,
        displayName: candidate.displayName,
        action: Object.keys(patch).length > 0 ? "update" : "matched",
        match: resolved.match,
        patch,
        user: summarizeExistingUser(existingUser),
      });
      continue;
    }

    const loginName = nextAvailableLoginName(candidate.preferredLoginName, indexes.usedLoginNames);
    const email = nextAvailableEmail(candidate.preferredEmail, indexes.usedEmails);
    const username = nextAvailableUsername(candidate.usernameBase, indexes.usedUsernames);
    if (!loginName || !email || !username) {
      assessments.push({
        employeeName: candidate.employeeName,
        displayName: candidate.displayName,
        action: "skip",
        reason: "unique_identity_unavailable",
      });
      continue;
    }

    indexes.usedLoginNames.add(normalizeLoginNameForLookup(loginName));
    indexes.usedEmails.add(email);
    indexes.usedUsernames.add(username);

    assessments.push({
      employeeName: candidate.employeeName,
      displayName: candidate.displayName,
      action: "create",
      create: {
        employeeName: candidate.employeeName,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        username,
        loginName,
        email,
        group: defaultGroup,
        department: defaultGroup,
        ibx: defaultIbx,
        approved: true,
        isAdmin: false,
        isRoot: false,
        mustChangePassword: false,
        provisionedFromShiftplan: true,
        provisionedEmployeeName: candidate.employeeName,
      },
    });
  }

  return {
    totalEmployees: employees.length,
    uniqueEmployees: seenCandidates.length,
    matchedExisting,
    assessments,
  };
}

export function buildProvisioningPlan({ employees, existingUsers, defaultGroup = DEFAULT_GROUP, defaultIbx = DEFAULT_IBX }) {
  const assessment = buildProvisioningAssessment({ employees, existingUsers, defaultGroup, defaultIbx });
  const creates = [];
  const updates = [];
  const skipped = [];

  for (const item of assessment.assessments) {
    if (item.action === "create" && item.create) {
      creates.push(item.create);
      continue;
    }

    if (item.action === "update" && item.user?.id && item.patch) {
      updates.push({
        employeeName: item.employeeName,
        userId: item.user.id,
        loginName: item.user.loginName,
        email: item.user.email,
        match: item.match,
        patch: item.patch,
      });
      continue;
    }

    if (item.action === "skip") {
      skipped.push({ employeeName: item.employeeName, reason: item.reason });
    }
  }

  return {
    totalEmployees: assessment.totalEmployees,
    uniqueEmployees: assessment.uniqueEmployees,
    matchedExisting: assessment.matchedExisting,
    creates,
    updates,
    skipped,
  };
}

function summarizePlan(plan, dryRun) {
  return {
    dryRun,
    totalEmployees: plan.totalEmployees,
    uniqueEmployees: plan.uniqueEmployees,
    matchedExisting: plan.matchedExisting,
    created: plan.creates.length,
    updated: plan.updates.length,
    skipped: plan.skipped.length,
    createdUsers: plan.creates.map((user) => ({ loginName: user.loginName, email: user.email, username: user.username })),
    updatedUsers: plan.updates.map((user) => ({ userId: user.userId, loginName: user.loginName, email: user.email, match: user.match, patch: user.patch })),
    skippedUsers: plan.skipped,
  };
}

export async function provisionUsersForEmployees({
  employees,
  dryRun = false,
  logger = console,
} = {}) {
  const client = await pool.connect();
  try {
    const inputEmployees = Array.isArray(employees)
      ? employees
      : [];
    const normalizedEmployees = inputEmployees.map((employee) => {
      if (typeof employee === "string") {
        return { employeeName: employee, email: "" };
      }
      return {
        employeeName: employee.employeeName ?? employee.employee_name ?? employee.displayName ?? employee.display_name ?? employee.name,
        email: employee.email || "",
        upn: employee.upn || employee.userPrincipalName || "",
        employeeId: employee.employeeId ?? employee.employee_id ?? "",
        entraObjectId: employee.entraObjectId ?? employee.entra_object_id ?? employee.azureAdId ?? "",
      };
    });

      const employeeRows = normalizedEmployees.length > 0
      ? normalizedEmployees
      : (await client.query(
        `SELECT DISTINCT s.employee_name AS "employeeName", ec.email, ec.upn, ec.employee_id, ec.entra_object_id
         FROM shifts s
         LEFT JOIN employee_contacts ec ON ec.employee_name = s.employee_name
         WHERE s.employee_name IS NOT NULL AND btrim(s.employee_name) <> ''
         ORDER BY s.employee_name ASC`
      )).rows;

    const existingUsersRes = await client.query(
      `SELECT id, login_name, email, username, first_name, last_name, approved,
              provisioned_from_shiftplan, provisioned_employee_name,
              is_admin, is_root, upn, employee_id, entra_object_id
       FROM users
       WHERE is_root = false
       ORDER BY id ASC`
    );

    const plan = buildProvisioningPlan({
      employees: employeeRows,
      existingUsers: existingUsersRes.rows,
    });

    const summary = summarizePlan(plan, dryRun);
    if (dryRun) {
      logger.log?.(`[USER PROVISIONING] Dry run: ${summary.created} create, ${summary.updated} update, ${summary.skipped} skipped.`);
      return summary;
    }

    if (plan.creates.length === 0 && plan.updates.length === 0) {
      logger.log?.("[USER PROVISIONING] No user changes required.");
      return summary;
    }

    await client.query("BEGIN");

    const passwordHash = `SSO_ONLY_${crypto.randomBytes(32).toString("hex")}`;
    for (const create of plan.creates) {
      await client.query(
        `INSERT INTO users (
           first_name,
           last_name,
           username,
            login_name,
           email,
           password_hash,
           user_group,
           department,
           ibx,
           approved,
           is_admin,
           is_root,
           must_change_password,
           provisioned_from_shiftplan,
           provisioned_employee_name
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          create.firstName,
          create.lastName,
          create.username,
          create.loginName,
          create.email,
          passwordHash,
          create.group,
          create.department,
          create.ibx,
          create.approved,
          create.isAdmin,
          create.isRoot,
          create.mustChangePassword,
          create.provisionedFromShiftplan,
          create.provisionedEmployeeName,
        ]
      );
    }

    for (const update of plan.updates) {
      const fields = [];
      const values = [];
      let idx = 1;

      if (update.patch.firstName !== undefined) {
        fields.push(`first_name = $${idx++}`);
        values.push(update.patch.firstName);
      }
      if (update.patch.lastName !== undefined) {
        fields.push(`last_name = $${idx++}`);
        values.push(update.patch.lastName);
      }
      if (update.patch.email !== undefined) {
        fields.push(`email = $${idx++}`);
        values.push(update.patch.email);
      }
      if (update.patch.loginName !== undefined) {
        fields.push(`login_name = $${idx++}`);
        values.push(update.patch.loginName);
      }
      if (update.patch.approved !== undefined) {
        fields.push(`approved = $${idx++}`);
        values.push(update.patch.approved);
      }
      if (update.patch.provisionedFromShiftplan !== undefined) {
        fields.push(`provisioned_from_shiftplan = $${idx++}`);
        values.push(update.patch.provisionedFromShiftplan);
      }
      if (update.patch.provisionedEmployeeName !== undefined) {
        fields.push(`provisioned_employee_name = $${idx++}`);
        values.push(update.patch.provisionedEmployeeName);
      }

      values.push(update.userId);
      await client.query(
        `UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx}`,
        values
      );
    }

    await client.query("COMMIT");
    logger.log?.(`[USER PROVISIONING] Applied: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped.`);
    return summary;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function provisionUsersFromShiftplan({
  dryRun = false,
  logger = console,
} = {}) {
  return provisionUsersForEmployees({
    dryRun,
    logger,
  });
}
