import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicId } from "./utils.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, "..");
const dataDirectory = path.join(projectRoot, "data");
const databasePath = process.env.DATABASE_FILE || path.join(dataDirectory, "finix-printing.sqlite");

fs.mkdirSync(dataDirectory, { recursive: true });

const database = new DatabaseSync(databasePath);

database.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    schema_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    FOREIGN KEY (form_id) REFERENCES forms (id) ON DELETE CASCADE
  );
`);

const insertFormStatement = database.prepare(`
  INSERT INTO forms (public_id, title, description, schema_json, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const selectFormsStatement = database.prepare(`
  SELECT
    forms.*,
    COUNT(responses.id) AS response_count
  FROM forms
  LEFT JOIN responses ON responses.form_id = forms.id
  GROUP BY forms.id
  ORDER BY forms.id DESC
`);

const selectFormByIdStatement = database.prepare(`
  SELECT * FROM forms WHERE id = ?
`);

const selectFormByPublicIdStatement = database.prepare(`
  SELECT * FROM forms WHERE public_id = ?
`);

const insertResponseStatement = database.prepare(`
  INSERT INTO responses (form_id, payload_json, submitted_at)
  VALUES (?, ?, ?)
`);

const selectResponsesByFormStatement = database.prepare(`
  SELECT * FROM responses WHERE form_id = ? ORDER BY id DESC
`);

function mapFormRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    publicId: row.public_id,
    title: row.title,
    description: row.description,
    questions: JSON.parse(row.schema_json),
    createdAt: row.created_at,
    responseCount: row.response_count ?? 0
  };
}

function mapResponseRow(row) {
  return {
    id: row.id,
    formId: row.form_id,
    answers: JSON.parse(row.payload_json),
    submittedAt: row.submitted_at
  };
}

export function listForms() {
  return selectFormsStatement.all().map(mapFormRow);
}

export function getFormById(id) {
  return mapFormRow(selectFormByIdStatement.get(Number(id)));
}

export function getFormByPublicId(publicId) {
  return mapFormRow(selectFormByPublicIdStatement.get(publicId));
}

export function createForm({ title, description, questions }) {
  const createdAt = new Date().toISOString();
  const publicId = createPublicId();

  const result = insertFormStatement.run(
    publicId,
    title,
    description,
    JSON.stringify(questions),
    createdAt
  );

  return getFormById(result.lastInsertRowid);
}

export function createResponse(formId, answers) {
  const submittedAt = new Date().toISOString();
  const result = insertResponseStatement.run(formId, JSON.stringify(answers), submittedAt);

  return {
    id: result.lastInsertRowid,
    formId,
    answers,
    submittedAt
  };
}

export function listResponses(formId) {
  return selectResponsesByFormStatement.all(Number(formId)).map(mapResponseRow);
}
