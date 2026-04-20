import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const ALLOWED_TYPES = new Set([
  "short_text", "paragraph", "multiple_choice", "checkboxes",
  "dropdown", "date", "number", "email", "image"
]);

const OPTION_TYPES = new Set(["multiple_choice", "checkboxes", "dropdown"]);

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function createPublicId() {
  return `fmx-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function sanitizeText(value, maxLength = 240) {
  return String(value ?? "")
    .replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function isOptionQuestion(type) {
  return OPTION_TYPES.has(type);
}

export function parseOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return [];
  return [...new Set(rawOptions.map((option) => sanitizeText(option, 120)).filter(Boolean))];
}

export function sanitizeFormPayload(payload) {
  const title = sanitizeText(payload?.title, 120);
  const description = sanitizeText(payload?.description, 600);
  const questionsInput = Array.isArray(payload?.questions) ? payload.questions : [];

  if (!title) throw new Error("Form title is required.");
  if (!questionsInput.length) throw new Error("Add at least one question to create the form.");

  const seenIds = new Set();
  const questions = questionsInput.map((question, index) => {
    const label = sanitizeText(question?.label, 200);
    const type = ALLOWED_TYPES.has(question?.type) ? question.type : "short_text";
    const required = Boolean(question?.required);
    const idBase = sanitizeText(question?.id, 50).replace(/[^\w-]/g, "") || `q_${index + 1}`;
    const id = seenIds.has(idBase) ? `${idBase}_${index + 1}` : idBase;
    const options = isOptionQuestion(type) ? parseOptions(question?.options) : [];

    seenIds.add(id);
    if (!label) throw new Error(`Question ${index + 1} needs a label.`);
    if (isOptionQuestion(type) && options.length < 2) throw new Error(`Question ${index + 1} needs at least two options.`);

    return { id, label, type, required, options };
  });

  return { title, description, questions };
}

export function normalizeAnswers(form, answersInput) {
  const answers = {};
  const source = answersInput && typeof answersInput === "object" ? answersInput : {};

  for (const question of form.questions) {
    const rawValue = source[question.id];

    if (question.type === "checkboxes") {
      const values = Array.isArray(rawValue)
        ? rawValue.map((entry) => sanitizeText(entry, 120)).filter((entry) => question.options.includes(entry))
        : [];
      if (question.required && !values.length) throw new Error(`"${question.label}" is required.`);
      answers[question.id] = values;
      continue;
    }

    // image answers are file paths saved by the upload handler — skip text sanitization
    if (question.type === "image") {
      const value = typeof rawValue === "string" ? rawValue : "";
      if (question.required && !value) throw new Error(`"${question.label}" is required.`);
      answers[question.id] = value;
      continue;
    }

    const value = sanitizeText(rawValue, 500);
    if (question.required && !value) throw new Error(`"${question.label}" is required.`);
    if (value && isOptionQuestion(question.type) && !question.options.includes(value)) throw new Error(`"${question.label}" contains an invalid option.`);
    if (value && question.type === "number" && Number.isNaN(Number(value))) throw new Error(`"${question.label}" must be a valid number.`);
    if (value && question.type === "email" && !value.includes("@")) throw new Error(`"${question.label}" must be a valid email address.`);

    answers[question.id] = value;
  }

  return answers;
}

export function answerToDisplay(question, answers) {
  const value = answers?.[question.id];
  if (Array.isArray(value)) return value.join(", ");
  // For image fields return the path — admin UI will render as <img>
  return String(value ?? "");
}

export function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: process.env.TZ || "Asia/Kolkata",
    hour12: true
  });
}

export function buildResponseTable(form, responses) {
  const columns = [
    { key: "submittedAt", label: "Submitted At" },
    ...form.questions.map((question) => ({ key: question.id, label: question.label }))
  ];

  const rows = responses.map((response) => {
    const answers = response.answers ?? {};
    const row = {
      id: response.id,
      submittedAt: response.submittedAt,
      submittedAtLabel: formatDateTime(response.submittedAt),
      cells: {}
    };
    for (const question of form.questions) {
      row.cells[question.id] = answerToDisplay(question, answers);
    }
    return row;
  });

  return { columns, rows };
}

// ---- Real .xlsx export using the xlsx package ----
export function buildXlsxBuffer(form, responses) {
  const table = buildResponseTable(form, responses);

  // Build array-of-arrays: header row + data rows
  const headerRow = table.columns.map((col) => col.label);

  const dataRows = table.rows.map((row) => [
    row.submittedAtLabel,
    ...form.questions.map((q) => row.cells[q.id] ?? "")
  ]);

  const worksheetData = [headerRow, ...dataRows];

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Style the header row bold by setting cell styles
  const headerRange = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
  for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (worksheet[cellAddress]) {
      worksheet[cellAddress].s = { font: { bold: true } };
    }
  }

  // Auto-fit column widths
  const colWidths = worksheetData[0].map((_, colIndex) =>
    Math.min(40, Math.max(12, ...worksheetData.map((row) => String(row[colIndex] ?? "").length)))
  );
  worksheet["!cols"] = colWidths.map((w) => ({ wch: w }));

  XLSX.utils.book_append_sheet(workbook, worksheet, "Responses");

  // Return as Buffer
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellStyles: true });
}

export async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) return {};
  return JSON.parse(rawBody);
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

export function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(html);
}

export async function sendStaticFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };
  const content = await fs.readFile(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypes[extension] ?? "application/octet-stream",
    "Cache-Control": "no-store"
  });
  response.end(content);
}

export async function readSiteConfig(configPath) {
  const rawConfig = await fs.readFile(configPath, "utf8");
  return JSON.parse(rawConfig);
}
