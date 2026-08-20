const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { t } = require("./i18n");

const BRAND = "#D84E55";
const DARK = "#1F2937";
const MUTED = "#6B7280";
const LINE = "#E5E7EB";

const fmtTime = (t) => (t === undefined || t === null || t === "" ? "--" : `${t}:00`);
const fmtDate = (d) => (d ? String(d) : "--");

function money(n) {
  const v = Number(n || 0);
  return `Rs. ${v.toLocaleString("en-IN")}`;
}

/**
 * Renders a printable bus ticket for a booking. `bus` is the bus snapshot
 * (operatorName/busType/image/departureTime) used only as a fallback; the
 * booking's own busDetails take precedence.
 *
 * Returns a Promise resolving to a Buffer of the generated PDF.
 */
async function generateTicketPdf(booking, bus = null, lang = "en") {
  const details = booking.busDetails || {};
  const operator =
    details.operatorName ||
    (bus && bus.operatorName) ||
    booking.operatorName ||
    "TEDBUS";
  const busType = details.busType || (bus && bus.busType) || "AC Seater";

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 36, bottom: 36, left: 40, right: 40 },
    info: {
      Title: `TEDBUS Ticket ${booking.pnr || ""}`,
      Author: "TEDBUS",
      Subject: `Bus ticket ${booking.pnr || ""}`,
    },
  });

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const passengerNames = (booking.passengerDetails || [])
    .map((p) => p.name)
    .join(", ");
  const seats = (booking.seats || []).join(", ");
  const paymentStatus = booking.paymentStatus || "verified";
  const bookingStatus = ["cancelled"].includes(booking.status)
    ? t(lang, "pdf.statusCancelled")
    : ["upcoming", "ticket_confirmed", "payment_verified"].includes(booking.status)
      ? t(lang, "pdf.statusTicketConfirmed")
      : (booking.status || t(lang, "pdf.statusConfirmed"));

  // ----- Header band -----
  doc.rect(0, 0, doc.page.width, 70).fill(BRAND);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(24)
    .text("TEDBUS", 40, 22);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(t(lang, "pdf.busTicket"), 40, 50);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("PNR", doc.page.width - 40 - 160, 24, { width: 160, align: "right" });
  doc
    .fontSize(16)
    .text(booking.pnr || booking._id?.toString().slice(-8).toUpperCase() || "--", doc.page.width - 40 - 160, 40, {
      width: 160,
      align: "right",
    });

  let y = 96;

  // ----- Journey summary row -----
  doc
    .fillColor(DARK)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(booking.departureDetails?.city || "--", 40, y);
  doc
    .font("Helvetica")
    .fontSize(14)
    .text("→", 40 + 130, y + 4, { width: 30, align: "center" });
  doc
    .fillColor(DARK)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(booking.arrivalDetails?.city || "--", 40 + 160, y);
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(11)
    .text(`${t(lang, "pdf.departure")} ${fmtDate(booking.departureDetails?.date)} · ${fmtTime(booking.departureDetails?.time)}`, 40, y + 26);
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(11)
    .text(`${t(lang, "pdf.arrival")} ${fmtDate(booking.arrivalDetails?.date)} · ${fmtTime(booking.arrivalDetails?.time)}`, 40 + 160, y + 26);

  y += 56;
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).strokeColor(LINE).lineWidth(1).stroke();

  // ----- Details grid -----
  y += 16;
  const col1 = 40;
  const col2 = 210;
  const col3 = 400;
  const rowH = 26;

  const put = (x, yy, label, value, opts = {}) => {
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(label.toUpperCase(), x, yy);
    doc
      .fillColor(opts.color || DARK)
      .font("Helvetica-Bold")
      .fontSize(opts.size || 11)
      .text(value, x, yy + 11, { width: opts.width || 150 });
  };

  put(col1, y, t(lang, "pdf.passenger"), passengerNames || "--");
  put(col2, y, t(lang, "pdf.operator"), operator);
  put(col3, y, t(lang, "pdf.busType"), busType);
  y += rowH;
  put(col1, y, t(lang, "pdf.boarding"), `${booking.departureDetails?.city || "--"} · ${fmtTime(booking.departureDetails?.time)}`);
  put(col2, y, t(lang, "pdf.dropping"), `${booking.arrivalDetails?.city || "--"} · ${fmtTime(booking.arrivalDetails?.time)}`);
  put(col3, y, t(lang, "pdf.journeyDate"), fmtDate(booking.departureDetails?.date));
  y += rowH;
  put(col1, y, t(lang, "pdf.seatNumbers"), seats || "--");
  put(col2, y, t(lang, "pdf.amountPaid"), money(booking.fare));
  put(col3, y, t(lang, "pdf.paymentStatus"), paymentStatus.toUpperCase());
  y += rowH;
  put(col1, y, t(lang, "pdf.bookingStatus"), bookingStatus);
  put(col2, y, t(lang, "pdf.bookingDate"), fmtDate(booking.bookingDate));
  put(col3, y, t(lang, "pdf.ticketId"), booking.pnr || "--");
  y += rowH + 6;

  // ----- QR block -----
  const qrData = booking.qrPayload || "";
  if (qrData) {
    try {
      const qrPng = await QRCode.toBuffer(qrData, { margin: 1, width: 240, errorCorrectionLevel: "M" });
      doc.image(qrPng, doc.page.width - 40 - 130, y, { width: 130, height: 130 });
    } catch (e) {
      doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(t(lang, "pdf.scanAtBoarding"), doc.page.width - 40 - 130, y);
    }
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(t(lang, "pdf.scanToVerify"), doc.page.width - 40 - 130, y + 136, { width: 130, align: "center" });
  }

  doc.moveTo(40, y + 152).lineTo(doc.page.width - 40, y + 152).strokeColor(LINE).lineWidth(1).stroke();

  // ----- Passenger table -----
  y += 168;
  doc.fillColor(DARK).font("Helvetica-Bold").fontSize(12).text(t(lang, "pdf.passengers"), 40, y);
  y += 20;
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text("#", 40, y);
  doc.text(t(lang, "pdf.name"), 70, y);
  doc.text(t(lang, "pdf.gender"), 280, y);
  doc.text(t(lang, "pdf.age"), 400, y);
  y += 14;
  (booking.passengerDetails || []).forEach((p, i) => {
    doc.fillColor(DARK).font("Helvetica").fontSize(10);
    doc.text(String(i + 1), 40, y);
    doc.text(p.name || "--", 70, y);
    doc.text(p.gender || "--", 280, y);
    doc.text(p.age !== undefined ? String(p.age) : "--", 400, y);
    y += 18;
  });

  // ----- T&C footer -----
  const bottomY = doc.page.height - 78;
  doc.moveTo(40, bottomY).lineTo(doc.page.width - 40, bottomY).strokeColor(LINE).lineWidth(1).stroke();
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(7)
    .text(
      t(lang, "pdf.terms"),
      40,
      bottomY + 10,
      { width: doc.page.width - 80 }
    );
  doc
    .fontSize(8)
    .text(
      t(lang, "pdf.generatedBy", {
        date: new Date().toLocaleString("en-IN"),
        pnr: booking.pnr || "--",
        site: "www.tedbus.example",
      }),
      40,
      doc.page.height - 26
    );

  doc.end();
  return done;
}

module.exports = { generateTicketPdf };
