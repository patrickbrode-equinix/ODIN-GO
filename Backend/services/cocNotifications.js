import nodemailer from "nodemailer";
import { config } from "../config/index.js";

let transporter;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getCocMailStatus() {
  const missing = [];
  let publicUrlValid = false;
  try {
    const url = new URL(config.COC_PUBLIC_URL);
    publicUrlValid = url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch { /* invalid or missing URL */ }
  if (!publicUrlValid) missing.push("COC_PUBLIC_URL (gültige HTTPS-Adresse)");
  if (!config.SMTP_HOST) missing.push("SMTP_HOST");
  if (!config.SMTP_FROM) missing.push("SMTP_FROM");
  return {
    enabled: missing.length === 0,
    publicUrl: publicUrlValid ? config.COC_PUBLIC_URL : null,
    smtpHostConfigured: Boolean(config.SMTP_HOST),
    fromConfigured: Boolean(config.SMTP_FROM),
    authentication: "jarvis_sso",
    missing,
  };
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return transporter;
}

export function createCocReviewLink({ caseId }) {
  if (!config.COC_PUBLIC_URL) return null;
  const url = new URL("/coc", `${config.COC_PUBLIC_URL}/`);
  url.searchParams.set("caseId", String(Number(caseId)));
  return url.toString();
}

export async function sendCocReviewNotification({ caseId, reference, title, classification, recipientUserId, recipientName, recipientEmail, submittedBy }) {
  const status = getCocMailStatus();
  if (!status.enabled) return { sent: false, reason: "mail_not_configured", missing: status.missing };
  if (!recipientEmail) return { sent: false, reason: "recipient_email_missing" };
  const reviewLink = createCocReviewLink({ caseId });
  await getTransporter().sendMail({
    from: config.SMTP_FROM,
    to: recipientEmail,
    subject: `[${reference}] CoC-Prüfung: ${title}`,
    text: `Hallo ${recipientName},\n\n${submittedBy} hat einen CoC-Vorgang (${classification}) zur Prüfung eingereicht.\n\n${title}\n\nVorgang öffnen: ${reviewLink}\n\nDer Zugriff wird ausschließlich über deine in Jarvis angemeldete SSO-Identität freigeschaltet. Öffne CoC bei Bedarf zuerst über den Button in Jarvis.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;color:#102033"><p>Hallo ${escapeHtml(recipientName)},</p><p><strong>${escapeHtml(submittedBy)}</strong> hat einen CoC-Vorgang zur Prüfung eingereicht.</p><div style="padding:18px;border:1px solid #d8e8ef;border-radius:12px;background:#f6fbfd"><div style="font-size:12px;color:#527080">${escapeHtml(reference)} · ${escapeHtml(classification)}</div><h2 style="margin:8px 0 0">${escapeHtml(title)}</h2></div><p style="margin:24px 0"><a href="${escapeHtml(reviewLink)}" style="padding:12px 18px;border-radius:10px;background:#087fa3;color:white;text-decoration:none;font-weight:bold">Vorgang öffnen</a></p><p style="font-size:12px;color:#68808d">Der Zugriff wird ausschließlich über die in Jarvis angemeldete SSO-Identität freigeschaltet. Öffne CoC bei Bedarf zuerst über den Button in Jarvis.</p></div>`,
  });
  return { sent: true };
}

export async function sendCocTestEmail(recipientEmail) {
  const status = getCocMailStatus();
  if (!status.enabled) return { sent: false, reason: "mail_not_configured", missing: status.missing };
  await getTransporter().sendMail({
    from: config.SMTP_FROM,
    to: recipientEmail,
    subject: "CoC E-Mail-Test erfolgreich",
    text: `Der CoC-Mailversand ist aktiv. Öffentliche Adresse: ${config.COC_PUBLIC_URL}`,
    html: `<div style="font-family:Arial,sans-serif"><h2>CoC E-Mail-Test erfolgreich</h2><p>Der Mailversand und die öffentliche Adresse sind eingerichtet.</p><p><a href="${escapeHtml(config.COC_PUBLIC_URL)}/coc">CoC öffnen</a></p></div>`,
  });
  return { sent: true };
}
