let nodemailer = null;
const { t } = require("./i18n");

// Lazy-require so the rest of the app (and this module's consumers) work even
// if nodemailer failed to install.
try {
  nodemailer = require("nodemailer");
} catch (e) {
  nodemailer = null;
}

const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  from: process.env.SMTP_FROM || "TEDBUS <no-reply@tedbus.local>",
};

let smtpConfigLogged = false;

function logSmtpStatus() {
  if (smtpConfigLogged) return;
  smtpConfigLogged = true;
  if (!nodemailer) {
    console.error("[ticketMailer] nodemailer package is NOT installed. Run: npm install nodemailer");
  } else if (!EMAIL_CONFIG.host) {
    console.error("[ticketMailer] SMTP_HOST is not set in .env — emails will NOT be sent.");
    console.error("[ticketMailer] Required env vars: SMTP_HOST, SMTP_USER, SMTP_PASS");
    console.error("[ticketMailer] For Gmail: use smtp.gmail.com, port 587, and a Gmail App Password.");
  } else if (!EMAIL_CONFIG.user || !EMAIL_CONFIG.pass) {
    console.error("[ticketMailer] SMTP_USER or SMTP_PASS is empty in .env — emails will NOT be sent.");
    console.error("[ticketMailer] For Gmail: generate an App Password at https://myaccount.google.com/apppasswords");
  } else {
    console.log("[ticketMailer] SMTP configured: host=" + EMAIL_CONFIG.host + " port=" + EMAIL_CONFIG.port + " user=" + EMAIL_CONFIG.user.replace(/(.{2}).*(@.*)/, "$1***$2"));
  }
}

function makeTransporter() {
  if (!nodemailer) {
    logSmtpStatus();
    return null;
  }
  if (!EMAIL_CONFIG.host || !EMAIL_CONFIG.user || !EMAIL_CONFIG.pass) {
    logSmtpStatus();
    return null;
  }
  return nodemailer.createTransport({
    host: EMAIL_CONFIG.host,
    port: EMAIL_CONFIG.port,
    secure: EMAIL_CONFIG.secure,
    auth: { user: EMAIL_CONFIG.user, pass: EMAIL_CONFIG.pass },
  });
}

const fmtTime = (t) => (t === undefined || t === null || t === "" ? "--" : `${t}:00`);

/**
 * Sends the ticket email with the generated PDF attached. Resolves quietly when
 * SMTP is not configured (mirrors notificationService's graceful degradation),
 * so booking creation never fails because email is unavailable.
 */
async function sendTicketEmail(booking, pdfBuffer, to, lang = "en") {
  logSmtpStatus();
  const transporter = makeTransporter();
  if (!transporter) {
    console.warn("[ticketMailer] SMTP not configured — ticket email skipped. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env");
    return false;
  }
  const recipient = to || booking.email;
  if (!recipient) {
    console.warn("[ticketMailer] No recipient email — ticket email skipped.");
    return false;
  }

  const pnr = booking.pnr || booking._id?.toString().slice(-8).toUpperCase();
  const seats = (booking.seats || []).join(", ");
  const details = booking.busDetails || {};
  const operator = details.operatorName || "TEDBUS";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#d84e55;padding:18px 24px;">
      <div style="color:#fff;font-size:22px;font-weight:bold;">TEDBUS</div>
      <div style="color:#fdecec;font-size:12px;">${t(lang, "email.yourTicketConfirmed")}</div>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 6px;color:#111827;">${t(lang, "email.bookingConfirmed")}</h2>
      <p style="color:#6b7280;font-size:13px;margin:0 0 16px;">PNR <strong style="color:#d84e55;">${pnr}</strong> · ${operator}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151;">
        <tr><td style="padding:6px 0;color:#9ca3af;">${t(lang, "email.from")}</td><td style="padding:6px 0;font-weight:bold;">${booking.departureDetails?.city || "--"}</td></tr>
        <tr><td style="padding:6px 0;color:#9ca3af;">${t(lang, "email.to")}</td><td style="padding:6px 0;font-weight:bold;">${booking.arrivalDetails?.city || "--"}</td></tr>
        <tr><td style="padding:6px 0;color:#9ca3af;">${t(lang, "email.journeyDate")}</td><td style="padding:6px 0;font-weight:bold;">${booking.departureDetails?.date || "--"}</td></tr>
        <tr><td style="padding:6px 0;color:#9ca3af;">${t(lang, "email.depArr")}</td><td style="padding:6px 0;font-weight:bold;">${fmtTime(booking.departureDetails?.time)} → ${fmtTime(booking.arrivalDetails?.time)}</td></tr>
        <tr><td style="padding:6px 0;color:#9ca3af;">${t(lang, "email.seats")}</td><td style="padding:6px 0;font-weight:bold;">${seats || "--"}</td></tr>
        <tr><td style="padding:6px 0;color:#9ca3af;">${t(lang, "email.amountPaid")}</td><td style="padding:6px 0;font-weight:bold;">Rs. ${Number(booking.fare || 0).toLocaleString("en-IN")}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:12px;margin-top:18px;">${t(lang, "email.instruction")}</p>
    </div>
    <div style="background:#f9fafb;padding:12px 24px;color:#9ca3af;font-size:11px;">${t(lang, "email.footer")}</div>
  </div>`;

  try {
    console.log("[ticketMailer] Sending ticket email to " + recipient.replace(/(.{2}).*(@.*)/, "$1***$2") + " (PNR " + pnr + ")");
    await transporter.sendMail({
      from: EMAIL_CONFIG.from,
      to: recipient,
      subject: t(lang, "email.subject", {
        pnr,
        from: booking.departureDetails?.city || "",
        to: booking.arrivalDetails?.city || "",
      }),
      html,
      attachments: [
        {
          filename: `TEDBUS_${pnr}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    console.log("[ticketMailer] Ticket email sent to " + recipient.replace(/(.{2}).*(@.*)/, "$1***$2") + " (PNR " + pnr + ")");
    return true;
  } catch (err) {
    console.error("[ticketMailer] Failed to send ticket email (PNR " + pnr + "):", err.message);
    if (err.code === "EAUTH") {
      console.error("[ticketMailer] SMTP authentication failed. For Gmail, use an App Password (not your regular password).");
      console.error("[ticketMailer] Generate one at: https://myaccount.google.com/apppasswords");
    }
    return false;
  }
}

module.exports = { sendTicketEmail, EMAIL_CONFIG };
