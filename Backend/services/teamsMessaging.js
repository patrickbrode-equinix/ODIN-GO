import db from '../db.js';
import { config } from '../config/index.js';
import { formatShiftMonthLabel } from '../lib/shiftplanMonth.js';
import crypto from 'node:crypto';

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBooleanSetting(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function toIsoString(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeEnvironment(value = null) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'production' || normalized === 'prod' || normalized === 'live') return 'production';
  if (normalized === 'test' || normalized === 'development' || normalized === 'dev') return 'test';
  return process.env.NODE_ENV === 'production' ? 'production' : 'test';
}

function encodeMarkerValue(value) {
  return encodeURIComponent(String(value ?? ''));
}

function buildOdinEventMarker(event) {
  return [
    'ODIN_EVENT',
    `type=${encodeMarkerValue(event.type)}`,
    `eventId=${encodeMarkerValue(event.eventId)}`,
    `ticketId=${encodeMarkerValue(event.ticketId)}`,
    `ticketNumber=${encodeMarkerValue(event.ticketNumber)}`,
    `recipientUpn=${encodeMarkerValue(event.recipientUpn)}`,
    `recipientName=${encodeMarkerValue(event.recipientName)}`,
    `employeeId=${encodeMarkerValue(event.employeeId)}`,
    `environment=${encodeMarkerValue(event.environment)}`,
  ].join('|');
}

function getRetryAfterMs(response) {
  const retryAfter = response?.headers?.get?.('retry-after');
  if (!retryAfter) return 0;
  const asSeconds = Number.parseFloat(retryAfter);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return Math.min(asSeconds * 1000, 5000);
  const asDate = new Date(retryAfter);
  if (!Number.isNaN(asDate.getTime())) return Math.min(Math.max(asDate.getTime() - Date.now(), 0), 5000);
  return 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTeamsWebhookError(response, text = '') {
  const status = response?.status || 0;
  const statusText = response?.statusText || '';
  const shortBody = String(text || '').slice(0, 240);
  const messageByStatus = {
    400: 'Teams webhook rejected the payload (400).',
    401: 'Teams webhook authentication failed (401).',
    403: 'Teams webhook access is forbidden (403).',
    404: 'Teams webhook endpoint was not found (404).',
    429: 'Teams webhook is rate limited (429).',
  };
  const message = messageByStatus[status] || (status >= 500
    ? `Teams webhook server error (${status}).`
    : `Teams webhook returned ${status}${statusText ? ` ${statusText}` : ''}.`);
  const error = new Error(shortBody ? `${message} ${shortBody}` : message);
  error.status = status;
  error.statusText = statusText;
  return error;
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderTemplate(template, data) {
  return String(template || '')
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
      const value = data[key];
      return value == null ? '' : String(value);
    })
    .trim();
}

function getShiftWindowLabel(referenceDate = new Date()) {
  const hour = referenceDate.getHours();
  if (hour >= 22 || hour < 6) return 'N';
  if (hour >= 14) return 'L1';
  return 'E1';
}

function toRemainingMinutes(ticket) {
  const raw = ticket?.remainingMinutes ?? ticket?.remaining_minutes ?? null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;

  const dueAt = ticket?.dueAt || ticket?.commitAt || ticket?.revisedCommitDate || null;
  if (!dueAt) return undefined;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return undefined;
  return Math.max(Math.round((due.getTime() - Date.now()) / 60000), 0);
}

export async function loadTeamsSettings(keys = []) {
  const useFilter = Array.isArray(keys) && keys.length > 0;
  const query = useFilter
    ? 'SELECT key, value FROM teams_settings WHERE key = ANY($1::text[]) ORDER BY key'
    : 'SELECT key, value FROM teams_settings ORDER BY key';
  const params = useFilter ? [keys] : [];
  const { rows } = await db.query(query, params);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function isEnabled(value, fallback = false) {
  return parseBooleanSetting(value, fallback);
}

function isValidWebhookUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function buildTicketAssignmentNotificationDto({
  ticket = {},
  worker = {},
  assignedBy = 'ODIN',
  mode = 'shadow',
  runId = null,
  environment = null,
  eventId = null,
  createdAt = null,
} = {}) {
  const raw = ticket?.raw || {};
  const ticketId = firstNonEmpty(ticket?.id, raw?.id, ticket?.internalId, raw?.queue_item_id, ticket?.externalId);
  const ticketNumber = firstNonEmpty(
    ticket?.activity,
    ticket?.activityNumber,
    ticket?.externalId,
    ticket?.external_id,
    raw?.activity_number,
    raw?.activity,
    raw?.external_id,
    ticketId
  );
  const title = firstNonEmpty(
    ticket?.title,
    ticket?.shortDescription,
    ticket?.summary,
    ticket?.description,
    raw?.title,
    raw?.short_description,
    raw?.description,
    raw?.summary,
    ticketNumber
  );
  const recipientName = firstNonEmpty(worker?.name, worker?.employeeName, worker?.displayName, worker?.plannedEmployeeName, 'Unbekannt');
  const recipientUpn = firstNonEmpty(worker?.email, worker?.upn, worker?.userPrincipalName, worker?.mail, worker?.teamsEmail, worker?.raw?.email);
  const employeeId = firstNonEmpty(worker?.employeeId, worker?.employee_id, worker?.staffId, worker?.id, worker?.raw?.employee_id, worker?.raw?.id, recipientUpn);
  const dueOrStart = toIsoString(firstNonEmpty(ticket?.scheduledStart, ticket?.scheduled_start, raw?.scheduled_start, ticket?.dueAt, ticket?.commitAt, ticket?.revisedCommitDate, raw?.commit_date));

  return {
    type: 'ODIN_TICKET_ASSIGNMENT',
    eventId: eventId || crypto.randomUUID(),
    createdAt: createdAt || new Date().toISOString(),
    ticketNumber,
    ticketId: String(ticketId || ticketNumber || 'unknown'),
    ticketTitle: title,
    recipientName,
    recipientUpn,
    employeeId,
    recipientEntraId: firstNonEmpty(worker?.entraId, worker?.entra_id, worker?.azureAdId, worker?.aadObjectId, worker?.id),
    assignedBy: firstNonEmpty(assignedBy, 'ODIN'),
    priority: firstNonEmpty(ticket?.priority, raw?.priority, 'Unbekannt'),
    location: firstNonEmpty(ticket?.site, ticket?.ibx, ticket?.location, raw?.site, raw?.ibx, raw?.location, raw?.system_name),
    dueOrStart,
    ticketUrl: firstNonEmpty(ticket?.url, ticket?.ticketUrl, ticket?.deepLink, raw?.url, raw?.ticket_url),
    environment: normalizeEnvironment(environment),
    mode,
    runId,
  };
}

export function buildAssignmentAdaptiveCardPayload(notification) {
  const marker = buildOdinEventMarker(notification);
  const facts = [
    { title: 'Ticket', value: notification.ticketNumber || notification.ticketId || 'Unbekannt' },
    { title: 'Mitarbeiter', value: notification.recipientName || 'Unbekannt' },
    { title: 'Priorität', value: notification.priority || 'Unbekannt' },
    { title: 'Standort', value: notification.location || 'Unbekannt' },
    { title: 'Zugewiesen durch', value: notification.assignedBy || 'ODIN' },
    { title: 'Fällig', value: notification.dueOrStart || 'Unbekannt' },
  ];

  const body = [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: 'Neues Ticket zugewiesen' },
    { type: 'TextBlock', text: 'Dir wurde dieses Ticket zur Bearbeitung zugewiesen.', wrap: true },
    { type: 'FactSet', facts },
    {
      type: 'TextBlock',
      text: marker,
      wrap: false,
      size: 'Small',
      isSubtle: true,
      spacing: 'Small',
    },
  ];

  const content = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body,
    odinEventData: {
      ...notification,
      marker,
    },
  };

  if (notification.ticketUrl) {
    content.actions = [
      {
        type: 'Action.OpenUrl',
        title: 'Ticket öffnen',
        url: notification.ticketUrl,
      },
    ];
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content,
      },
    ],
  };
}

export function resolveTeamsWebhookUrl(settings = {}, channel = 'channel') {
  if (channel === 'personal') {
    return settings['teams.personalWebhookUrl'] || config.TEAMS_PERSONAL_WEBHOOK || '';
  }

  return settings['teams.powerAutomateWebhookUrl']
    || settings['teams.webhookUrl']
    || config.TEAMS_CHANNEL_WEBHOOK
    || config.TEAMS_PERSONAL_WEBHOOK
    || '';
}

function buildTeamsAdaptiveCard(title, body, footer = 'ODIN') {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.2',
          body: [
            { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: String(title || 'ODIN') },
            { type: 'TextBlock', text: String(body || ''), wrap: true },
            {
              type: 'TextBlock',
              text: `${footer} · ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
              isSubtle: true,
              size: 'Small',
            },
          ],
        },
      },
    ],
  };
}

async function postTeamsWebhook(webhookUrl, card, { timeoutMs = 8000, maxRetries = 1, eventId = null } = {}) {
  if (!isValidWebhookUrl(webhookUrl)) {
    throw new Error('Invalid webhook URL. Please enter the full Power Automate HTTP trigger URL.');
  }

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
        signal: controller.signal,
      });

      const text = await response.text().catch(() => '');
      if (response.ok) {
        return { sent: true, status: response.status, responseText: text, attempts: attempt + 1 };
      }

      const error = createTeamsWebhookError(response, text);
      lastError = error;

      if (response.status === 429 && attempt < maxRetries) {
        const retryAfterMs = getRetryAfterMs(response);
        const waitMs = retryAfterMs > 0 ? retryAfterMs : 0;
        console.warn(`[Teams] Rate limited while sending Teams webhook${eventId ? ` event ${eventId}` : ''}; retrying once after ${waitMs}ms.`);
        await sleep(waitMs);
        attempt += 1;
        continue;
      }

      throw error;
    } catch (error) {
      lastError = error;
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`Teams webhook timed out after ${timeoutMs}ms.`);
        timeoutError.status = 0;
        lastError = timeoutError;
      }
      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Teams webhook delivery failed.');
}

export async function testPowerAutomateWebhook(webhookUrl) {
  const card = buildTeamsAdaptiveCard(
    'ODIN Power Automate Test',
    'Der Teams Webhook wurde erfolgreich von ODIN getestet. Wenn diese Nachricht im Kanal erscheint, ist der Flow aktiv.',
    'ODIN Test'
  );

  return postTeamsWebhook(webhookUrl, card);
}

async function resolveRecipients(recipientTokens, shiftFilter = [], referenceDate = new Date()) {
  const normalizedRecipients = [...new Set(recipientTokens.map((entry) => entry.trim()).filter(Boolean))];
  if (normalizedRecipients.length === 0) return [];

  const monthLabel = formatShiftMonthLabel(referenceDate.getFullYear(), referenceDate.getMonth() + 1);
  const day = referenceDate.getDate();

  const { rows } = await db.query(
    `SELECT ec.employee_name, ec.email, ec.is_active, s.shift_code
     FROM employee_contacts ec
     LEFT JOIN shifts s
       ON s.employee_name = ec.employee_name
      AND s.month = $2
      AND s.day = $3
     WHERE LOWER(ec.employee_name) = ANY($1::text[])
        OR LOWER(ec.email) = ANY($1::text[])
     ORDER BY ec.employee_name`,
    [normalizedRecipients.map((entry) => entry.toLowerCase()), monthLabel, day]
  );

  const lookup = new Map();
  for (const row of rows) {
    lookup.set(String(row.employee_name || '').toLowerCase(), row);
    if (row.email) lookup.set(String(row.email || '').toLowerCase(), row);
  }

  const resolved = normalizedRecipients.map((token) => {
    const row = lookup.get(token.toLowerCase());
    if (row) {
      return {
        employeeName: row.employee_name,
        email: row.email,
        shiftCode: row.shift_code || null,
        isActive: row.is_active !== false,
      };
    }
    return {
      employeeName: token.includes('@') ? null : token,
      email: token.includes('@') ? token : null,
      shiftCode: null,
      isActive: true,
    };
  });

  if (shiftFilter.length === 0) return resolved;

  return resolved.filter((recipient) => recipient.shiftCode && shiftFilter.includes(String(recipient.shiftCode).toUpperCase()));
}

async function sendBotTicketNotification(baseUrl, apiKey, payload) {
  if (!baseUrl || !apiKey) {
    return { success: false, skipped: true, reason: 'Bot internal API not configured' };
  }

  const response = await fetch(`${String(baseUrl).replace(/\/$/, '')}/api/internal/notify/ticket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-internal-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || data?.reason || `Bot notification failed (${response.status})`);
  }

  return data;
}

export async function sendTeamsMessage(webhookUrl, title, body) {
  let modeSettings = {};
  try {
    modeSettings = await loadTeamsSettings([
      'teams.communicationMode',
      'teams.powerAutomateWebhookUrl',
      'teams.webhookUrl',
    ]);
    const commMode = modeSettings['teams.communicationMode'] || 'webhook';
    if (commMode === 'disabled') {
      console.warn('[Teams] Communication mode is disabled - message skipped.');
      return { skipped: true, reason: 'disabled' };
    }
  } catch {
    // If settings lookup fails, proceed with the explicit URL if one was passed.
  }

  const resolvedWebhookUrl = webhookUrl || resolveTeamsWebhookUrl(modeSettings, 'channel');
  if (!resolvedWebhookUrl) {
    console.warn('[Teams] No webhook URL configured - message skipped.');
    return { skipped: true };
  }

  const card = buildTeamsAdaptiveCard(title, body, 'ODIN');
  return postTeamsWebhook(resolvedWebhookUrl, card);
}

export async function logTeamsMessage(type, recipient, channel, content, status, errorMsg) {
  await db.query(
    `INSERT INTO teams_message_log (message_type, recipient, channel, content, status, error_msg)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [type, recipient || null, channel || null, content, status, errorMsg || null]
  );
}

export function buildAssignmentNotificationMessage({ ticket, worker, mode, runId }) {
  const ticketId = ticket?.externalId || ticket?.external_id || ticket?.id || 'unbekannt';
  const activity = ticket?.activity || ticket?.raw?.activity || ticket?.raw?.activity_number || ticketId;
  const customer = ticket?.accountName || ticket?.account_name || ticket?.customerName || ticket?.customername || ticket?.raw?.account_name || ticket?.raw?.customername || 'unbekannt';
  const systemName = ticket?.systemName || ticket?.system_name || ticket?.raw?.system_name || 'ohne System';
  const queue = ticket?.queue || ticket?.queueType || ticket?.queue_type || ticket?.raw?.queue_type || ticket?.type || 'unbekannt';
  const priority = ticket?.priority || ticket?.raw?.priority || 'unbekannt';
  const dueAt = ticket?.dueAt || ticket?.commitAt || ticket?.revisedCommitDate || ticket?.raw?.commit_date || null;
  const resetTime = dueAt ? new Date(dueAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : 'unbekannt';

  return {
    title: `ODIN Ticket zugewiesen: ${ticketId}`,
    body: [
      `Mitarbeiter: ${worker?.name || 'unbekannt'}`,
      `Activity: ${activity}`,
      `Kunde: ${customer}`,
      `System: ${systemName}`,
      `Queue: ${queue}`,
      `Prioritaet: ${priority}`,
      `Resetzeit: ${resetTime}`,
      `Modus: ${mode || 'unknown'}${runId ? ` - Run ${runId}` : ''}`,
    ].join('\n'),
  };
}

export async function sendTeamsAssignmentNotification({ notification, webhookUrl, log = true } = {}) {
  const event = notification || buildTicketAssignmentNotificationDto();
  const payload = buildAssignmentAdaptiveCardPayload(event);
  const result = await postTeamsWebhook(webhookUrl, payload, { eventId: event.eventId });

  if (log) {
    await logTeamsMessage(
      'ODIN_TICKET_ASSIGNMENT',
      event.recipientUpn || event.recipientName || 'teams-channel',
      'channel',
      JSON.stringify({
        eventId: event.eventId,
        ticketId: event.ticketId,
        ticketNumber: event.ticketNumber,
        recipientUpn: event.recipientUpn,
        environment: event.environment,
      }),
      'sent',
      null
    );
  }

  return {
    success: true,
    sent: true,
    eventId: event.eventId,
    httpStatus: result.status || null,
    attempts: result.attempts || 1,
    payload,
  };
}

export async function notifyTicketAssignedToTeams({ ticket, worker, mode = 'shadow', runId = null, assignedBy = 'ODIN', environment = null } = {}) {
  const settings = await loadTeamsSettings([
    'teams.communicationMode',
    'teams.powerAutomateWebhookUrl',
    'teams.webhookUrl',
    'teams.webhookEnabled',
    'teams.notificationsEnabled',
    'teams.sendOnlyForLiveAssignments',
    'teams.assignmentNotificationsEnabled',
    'teams.assignmentNotificationsLiveOnly',
  ]);

  if ((settings['teams.communicationMode'] || 'webhook') === 'disabled') {
    return { skipped: true, reason: 'Teams communication is disabled' };
  }

  const notificationsEnabled = isEnabled(settings['teams.notificationsEnabled'], isEnabled(settings['teams.assignmentNotificationsEnabled'], false));
  const liveOnly = isEnabled(settings['teams.sendOnlyForLiveAssignments'], isEnabled(settings['teams.assignmentNotificationsLiveOnly'], true));

  if (!notificationsEnabled) {
    return { skipped: true, reason: 'Assignment Teams notifications disabled' };
  }

  if (liveOnly && mode !== 'live') {
    return { skipped: true, reason: 'Assignment Teams notifications restricted to live mode' };
  }

  if (!isEnabled(settings['teams.webhookEnabled'], true)) {
    return { skipped: true, reason: 'Teams webhook delivery disabled' };
  }

  const webhookUrl = resolveTeamsWebhookUrl(settings, 'channel');
  if (!webhookUrl) {
    return { skipped: true, reason: 'No Power Automate webhook URL configured' };
  }

  const notification = buildTicketAssignmentNotificationDto({
    ticket,
    worker,
    mode,
    runId,
    assignedBy,
    environment,
  });
  try {
    const result = await sendTeamsAssignmentNotification({ notification, webhookUrl, log: true });
    return { ...result, title: 'Neues Ticket zugewiesen' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logTeamsMessage(
      'ODIN_TICKET_ASSIGNMENT',
      notification.recipientUpn || notification.recipientName || 'teams-channel',
      'channel',
      JSON.stringify({
        eventId: notification.eventId,
        ticketId: notification.ticketId,
        ticketNumber: notification.ticketNumber,
        recipientUpn: notification.recipientUpn,
        environment: notification.environment,
      }),
      'failed',
      errorMessage
    );
    console.warn(`[Teams] Assignment notification ${notification.eventId} failed: ${errorMessage}`);
    return {
      success: false,
      sent: false,
      eventId: notification.eventId,
      httpStatus: error?.status || null,
      reason: errorMessage,
    };
  }
}

export async function sendTeamsAssignmentTestNotification({
  recipientName,
  recipientUpn,
  ticketNumber,
  location = '',
  priority = 'Normal',
  assignedBy = 'ODIN',
} = {}) {
  const settings = await loadTeamsSettings([
    'teams.communicationMode',
    'teams.powerAutomateWebhookUrl',
    'teams.webhookUrl',
    'teams.webhookEnabled',
  ]);

  if ((settings['teams.communicationMode'] || 'webhook') === 'disabled') {
    return { success: false, skipped: true, reason: 'Teams communication is disabled', httpStatus: null };
  }
  if (!isEnabled(settings['teams.webhookEnabled'], true)) {
    return { success: false, skipped: true, reason: 'Teams webhook delivery disabled', httpStatus: null };
  }

  const webhookUrl = resolveTeamsWebhookUrl(settings, 'channel');
  if (!webhookUrl) {
    return { success: false, skipped: true, reason: 'No Power Automate webhook URL configured', httpStatus: null };
  }

  const notification = buildTicketAssignmentNotificationDto({
    ticket: {
      id: `TEST-${Date.now()}`,
      externalId: ticketNumber || 'TEST-123456',
      activity: ticketNumber || 'TEST-123456',
      title: 'ODIN Teams Testbenachrichtigung',
      priority,
      site: location,
      dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    worker: {
      name: recipientName || 'ODIN Test User',
      email: recipientUpn || '',
    },
    assignedBy,
    mode: 'test',
    environment: 'test',
  });

  try {
    const result = await sendTeamsAssignmentNotification({ notification, webhookUrl, log: true });
    return {
      success: true,
      eventId: notification.eventId,
      httpStatus: result.httpStatus,
      message: 'Teams test notification sent',
      payload: result.payload,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      eventId: notification.eventId,
      httpStatus: error?.status || null,
      message: errorMessage,
    };
  }
}

export async function notifyDispatcherManualReview({ ticket, reason, category, mode = 'shadow' }) {
  // Check communication mode — if disabled, skip all notifications
  const modeSettings = await loadTeamsSettings(['teams.communicationMode']);
  const commMode = modeSettings['teams.communicationMode'] || 'webhook';
  if (commMode === 'disabled') {
    return { skipped: true, reason: 'Teams communication is disabled' };
  }

  const settings = await loadTeamsSettings([
    'dispatcher_manual_review_notify_systems',
    'dispatcher_manual_review_notify_subtypes',
    'dispatcher_manual_review_live_only',
    'dispatcher_manual_review_recipients',
    'dispatcher_manual_review_shift_filter',
    'dispatcher_manual_review_group_targets',
    'dispatcher_manual_review_channel_fallback',
    'dispatcher_manual_review_title',
    'dispatcher_manual_review_body',
    'fallback_recipient',
    'bot_internal_base_url',
  ]);

  const systemEnabled = parseBooleanSetting(settings.dispatcher_manual_review_notify_systems, false);
  const subtypeEnabled = parseBooleanSetting(settings.dispatcher_manual_review_notify_subtypes, false);
  const liveOnly = parseBooleanSetting(settings.dispatcher_manual_review_live_only, true);
  const channelFallback = parseBooleanSetting(settings.dispatcher_manual_review_channel_fallback, true);

  if (category === 'system_exclusion' && !systemEnabled) {
    return { skipped: true, reason: 'System exclusion notifications disabled' };
  }
  if (category === 'subtype_exclusion' && !subtypeEnabled) {
    return { skipped: true, reason: 'Subtype exclusion notifications disabled' };
  }
  if (liveOnly && mode !== 'live') {
    return { skipped: true, reason: 'Notification restricted to live mode' };
  }

  const referenceDate = new Date();
  const shiftFilter = parseCsv(settings.dispatcher_manual_review_shift_filter).map((entry) => entry.toUpperCase());
  const configuredRecipients = parseCsv(settings.dispatcher_manual_review_recipients);
  const fallbackRecipients = configuredRecipients.length > 0
    ? configuredRecipients
    : parseCsv(settings.fallback_recipient);
  const recipients = await resolveRecipients(fallbackRecipients, shiftFilter, referenceDate);
  const groupTargets = [
    ...parseCsv(settings.dispatcher_manual_review_group_targets),
    ...parseJsonArray(settings.dispatcher_manual_review_group_targets),
  ];

  const context = {
    ticketId: ticket?.externalId || ticket?.id || 'unbekannt',
    internalTicketId: ticket?.id || '',
    systemName: ticket?.systemName || ticket?.raw?.system_name || 'ohne Systemname',
    subtype: ticket?.customerTroubleType || ticket?.raw?.customer_trouble_type || ticket?.raw?.subtype || 'ohne Subtype',
    queue: ticket?.queue || ticket?.raw?.queue_type || 'unbekannt',
    priority: ticket?.priority || 'unknown',
    ticketType: ticket?.type || 'Unknown',
    category: category === 'system_exclusion' ? 'System-Ausnahme' : 'Subtype-Ausnahme',
    reason,
    mode,
    currentShiftWindow: getShiftWindowLabel(referenceDate),
  };

  const title = renderTemplate(
    settings.dispatcher_manual_review_title || 'Dispatcher Review · {{ticketId}} · {{category}}',
    context
  );
  const body = renderTemplate(
    settings.dispatcher_manual_review_body || [
      'Ticket {{ticketId}} wurde nicht automatisch zugewiesen.',
      'Kategorie: {{category}}',
      'System: {{systemName}}',
      'Subtype: {{subtype}}',
      'Queue: {{queue}}',
      'Grund: {{reason}}',
      'Modus: {{mode}}',
    ].join('\n'),
    context
  );

  const botBaseUrl = settings.bot_internal_base_url || process.env.TEAMS_BOT_INTERNAL_URL || '';
  const botApiKey = process.env.BOT_INTERNAL_API_KEY || '';

  const results = [];
  const recipientLabels = recipients.map((recipient) => recipient.employeeName || recipient.email).filter(Boolean);

  if (botBaseUrl && botApiKey && recipients.length > 0) {
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      const payload = {
        email: recipient.email,
        ticketId: String(context.ticketId),
        ticketType: context.ticketType,
        priority: context.priority,
        systemName: context.systemName,
        accountName: ticket?.accountName || ticket?.raw?.account_name || undefined,
        remainingMinutes: toRemainingMinutes(ticket),
        commitAt: ticket?.dueAt || ticket?.revisedCommitDate || ticket?.raw?.commit_date || undefined,
        ownerSuggestion: ticket?.owner || ticket?.raw?.owner || undefined,
        reason,
      };

      try {
        await sendBotTicketNotification(botBaseUrl, botApiKey, payload);
        await logTeamsMessage('DISPATCHER_MANUAL_REVIEW', recipient.employeeName || recipient.email, 'personal-bot', `${title}: ${body}`, 'sent', null);
        results.push({ recipient: recipient.employeeName || recipient.email, channel: 'personal-bot', success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logTeamsMessage('DISPATCHER_MANUAL_REVIEW', recipient.employeeName || recipient.email, 'personal-bot', `${title}: ${body}`, 'failed', message);
        results.push({ recipient: recipient.employeeName || recipient.email, channel: 'personal-bot', success: false, error: message });
      }
    }
  }

  const hasDeliveredBotMessages = results.some((entry) => entry.success);
  if (!hasDeliveredBotMessages && channelFallback) {
    const fallbackBody = [
      body,
      recipientLabels.length > 0 ? `\nAdressaten: ${recipientLabels.join(', ')}` : '',
      groupTargets.length > 0 ? `\nGruppen: ${groupTargets.join(', ')}` : '',
      shiftFilter.length > 0 ? `\nSchichtfilter: ${shiftFilter.join(', ')}` : '',
    ].join('').trim();

    const webhookUrl = config.TEAMS_CHANNEL_WEBHOOK || config.TEAMS_PERSONAL_WEBHOOK;
    const recipientLabel = [
      ...recipientLabels,
      ...groupTargets,
    ].filter(Boolean).join(', ') || 'dispatcher-fallback';

    try {
      await sendTeamsMessage(webhookUrl, title, fallbackBody);
      await logTeamsMessage('DISPATCHER_MANUAL_REVIEW', recipientLabel, webhookUrl === config.TEAMS_CHANNEL_WEBHOOK ? 'channel' : 'personal', `${title}: ${fallbackBody}`, 'sent', null);
      results.push({ recipient: recipientLabel, channel: webhookUrl === config.TEAMS_CHANNEL_WEBHOOK ? 'channel' : 'personal', success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logTeamsMessage('DISPATCHER_MANUAL_REVIEW', recipientLabel, webhookUrl === config.TEAMS_CHANNEL_WEBHOOK ? 'channel' : 'personal', `${title}: ${fallbackBody}`, 'failed', message);
      results.push({ recipient: recipientLabel, channel: webhookUrl === config.TEAMS_CHANNEL_WEBHOOK ? 'channel' : 'personal', success: false, error: message });
    }
  }

  return {
    skipped: results.length === 0,
    results,
  };
}
