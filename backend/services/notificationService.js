import nodemailer from "nodemailer";
import { environment } from "../config/environment.js";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "notification-service" });

function buildTransport() {
  if (!environment.EMAIL_SMTP_HOST || !environment.EMAIL_FROM) return null;
  return nodemailer.createTransport({
    host:   environment.EMAIL_SMTP_HOST,
    port:   Number(environment.EMAIL_SMTP_PORT ?? 587),
    secure: Number(environment.EMAIL_SMTP_PORT ?? 587) === 465,
    auth:   environment.EMAIL_SMTP_USER
      ? { user: environment.EMAIL_SMTP_USER, pass: environment.EMAIL_SMTP_PASS }
      : undefined,
  });
}

const transport = buildTransport();

const STATUS_LABEL = { success: "COMPLETED", failure: "FAILED" };

export async function sendJobNotification({ jobName, jobId, status, durationMs, recipients }) {
  if (!recipients?.length) return;

  if (!transport) {
    logger.info(
      { jobId, status, recipients },
      "Notification skipped (EMAIL_SMTP_HOST not configured)"
    );
    return;
  }

  const label   = STATUS_LABEL[status] ?? status.toUpperCase();
  const subject = `Axon job ${label}: ${jobName}`;
  const text    = [
    `Job:      ${jobName}`,
    `Status:   ${label}`,
    `Duration: ${durationMs != null ? (durationMs / 1000).toFixed(1) + "s" : "—"}`,
    `Job ID:   ${jobId}`,
  ].join("\n");

  try {
    await transport.sendMail({
      from:    environment.EMAIL_FROM,
      to:      recipients.join(", "),
      subject,
      text,
    });
    logger.info({ jobId, recipients, status }, "Notification email sent");
  } catch (error) {
    logger.warn({ err: error, jobId, recipients }, "Notification email failed");
  }
}