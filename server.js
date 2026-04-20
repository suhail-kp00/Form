import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createForm, createResponse, deleteForm, closeForm, reopenForm, getFormById, getFormByPublicId, listForms, listResponses } from "./lib/database.js";
import { renderDashboardPage, renderLandingPage, renderLoginPage, renderNotFoundPage, renderPublicFormPage } from "./lib/templates.js";
import {
  buildXlsxBuffer,
  buildResponseTable,
  normalizeAnswers,
  readJsonBody,
  readSiteConfig,
  sanitizeFormPayload,
  sendHtml,
  sendJson,
  sendStaticFile
} from "./lib/utils.js";
import { isAuthenticated, login, logout } from "./lib/auth.js";
import fsSync from "node:fs";
import { randomUUID } from "node:crypto";

// Loads site config. On Render (or any server without a data folder),
// all values fall back to environment variables — no file needed.
async function loadSiteConfig(configPath) {
  let file = {};
  try {
    file = await readSiteConfig(configPath);
  } catch {
    // file missing — fine, use env vars below
  }
  return {
    businessName:  process.env.SITE_BUSINESS_NAME  || file.businessName  || "Finix Printing",
    tagline:       process.env.SITE_TAGLINE         || file.tagline        || "",
    description:   process.env.SITE_DESCRIPTION     || file.description    || "",
    bookingNote:   process.env.SITE_BOOKING_NOTE     || file.bookingNote    || "",
    phone:         process.env.SITE_PHONE            || file.phone          || "",
    email:         process.env.SITE_EMAIL            || file.email          || "",
    address:       process.env.SITE_ADDRESS          || file.address        || "",
    whatsappUrl:   process.env.SITE_WHATSAPP_URL     || file.whatsappUrl    || "#",
    instagramUrl:  process.env.SITE_INSTAGRAM_URL    || file.instagramUrl   || "#",
    facebookUrl:   process.env.SITE_FACEBOOK_URL     || file.facebookUrl    || "#",
    adminUsername: process.env.ADMIN_USERNAME        || file.adminUsername  || "admin",
    adminPassword: process.env.ADMIN_PASSWORD        || file.adminPassword  || "changeme"
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteConfigPath = path.join(__dirname, "data", "site-config.json");
const publicDirectory = path.join(__dirname, "public");
const uploadDirectory = path.join(__dirname, "data", "uploads");
fsSync.mkdirSync(uploadDirectory, { recursive: true });

// Simple multipart/form-data parser for single file + JSON fields
async function parseMultipart(request) {
  return new Promise((resolve, reject) => {
    const contentType = request.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) return reject(new Error("No boundary in multipart request"));

    const boundary = "--" + boundaryMatch[1].trim();
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      try {
        const buffer = Buffer.concat(chunks);
        const parts = [];
        let start = 0;

        while (start < buffer.length) {
          const boundaryBuf = Buffer.from(boundary);
          const idx = buffer.indexOf(boundaryBuf, start);
          if (idx === -1) break;

          const nextIdx = buffer.indexOf(boundaryBuf, idx + boundaryBuf.length);
          const partEnd = nextIdx === -1 ? buffer.length : nextIdx;
          const part = buffer.slice(idx + boundaryBuf.length, partEnd);

          // Split headers from body (double CRLF)
          const headerEnd = part.indexOf("\r\n\r\n");
          if (headerEnd === -1) { start = partEnd; continue; }

          const headerStr = part.slice(0, headerEnd).toString("utf8");
          // body: trim trailing \r\n
          let body = part.slice(headerEnd + 4);
          if (body[body.length - 2] === 13 && body[body.length - 1] === 10) {
            body = body.slice(0, -2);
          }

          const nameMatch = headerStr.match(/name="([^"]+)"/);
          const fileMatch = headerStr.match(/filename="([^"]+)"/);
          if (nameMatch) {
            parts.push({
              name: nameMatch[1],
              filename: fileMatch ? fileMatch[1] : null,
              data: body,
              text: !fileMatch ? body.toString("utf8") : null
            });
          }
          start = partEnd;
        }
        resolve(parts);
      } catch (err) { reject(err); }
    });
  });
}

function getOrigin(request) {
  const host = request.headers.host || "localhost:3000";
  const protocol = request.headers["x-forwarded-proto"] || "http";
  return `${protocol}://${host}`;
}

function attachShareLink(origin, form) {
  return {
    ...form,
    shareLink: `${origin}/f/${form.publicId}`
  };
}

// Parse simple application/x-www-form-urlencoded body (for login form POST)
async function readFormBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return Object.fromEntries(new URLSearchParams(raw));
}

async function handleApi(request, response, pathname, origin) {
  // Public read-only routes — no auth required
  const publicFormMatch = pathname.match(/^\/api\/public\/forms\/([A-Za-z0-9-]+)$/);
  if (publicFormMatch && request.method === "GET") {
    const form = getFormByPublicId(publicFormMatch[1]);
    if (!form) {
      sendJson(response, 404, { error: "This form link is no longer available." });
      return true;
    }
    if (form.closed) {
      sendJson(response, 403, { error: "This form is no longer accepting responses.", closed: true });
      return true;
    }
    sendJson(response, 200, { form });
    return true;
  }

  const publicSubmitMatch = pathname.match(/^\/api\/public\/forms\/([A-Za-z0-9-]+)\/responses$/);
  if (publicSubmitMatch && request.method === "POST") {
    const form = getFormByPublicId(publicSubmitMatch[1]);
    if (!form) {
      sendJson(response, 404, { error: "This form link is no longer available." });
      return true;
    }
    if (form.closed) {
      sendJson(response, 403, { error: "This form is no longer accepting responses.", closed: true });
      return true;
    }
    const payload = await readJsonBody(request);
    const answers = normalizeAnswers(form, payload.answers);
    const savedResponse = createResponse(form.id, answers);
    sendJson(response, 201, { response: savedResponse });
    return true;
  }

  // All other /api/forms/* routes require authentication
  if (!isAuthenticated(request)) {
    sendJson(response, 401, { error: "Unauthorised. Please sign in to continue." });
    return true;
  }

  if (pathname === "/api/forms" && request.method === "GET") {
    const forms = listForms().map((form) => attachShareLink(origin, form));
    sendJson(response, 200, { forms });
    return true;
  }

  if (pathname === "/api/forms" && request.method === "POST") {
    const payload = sanitizeFormPayload(await readJsonBody(request));
    const form = attachShareLink(origin, createForm(payload));
    sendJson(response, 201, { form });
    return true;
  }

  const adminResponsesMatch = pathname.match(/^\/api\/forms\/(\d+)\/responses$/);
  if (adminResponsesMatch && request.method === "GET") {
    const form = getFormById(adminResponsesMatch[1]);
    if (!form) {
      sendJson(response, 404, { error: "Form not found." });
      return true;
    }
    const responsesList = listResponses(form.id);
    const table = buildResponseTable(form, responsesList);
    sendJson(response, 200, {
      form: attachShareLink(origin, form),
      responses: responsesList,
      table
    });
    return true;
  }

  const exportMatch = pathname.match(/^\/api\/forms\/(\d+)\/export\.xlsx$/);
  if (exportMatch && request.method === "GET") {
    const form = getFormById(exportMatch[1]);
    if (!form) {
      sendJson(response, 404, { error: "Form not found." });
      return true;
    }
    const workbook = buildXlsxBuffer(form, listResponses(form.id));
    const fileName = `${form.title.replace(/[^\w-]+/g, "-").toLowerCase() || "responses"}-responses.xlsx`;
    response.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    });
    response.end(workbook);
    return true;
  }

  // Image upload — multipart POST, auth required
  if (pathname === "/api/upload/image" && request.method === "POST") {
    let parts;
    try {
      parts = await parseMultipart(request);
    } catch {
      sendJson(response, 400, { error: "Invalid upload request." });
      return true;
    }

    const filePart = parts.find((p) => p.filename);
    if (!filePart) {
      sendJson(response, 400, { error: "No file found in upload." });
      return true;
    }

    const originalName = filePart.filename.toLowerCase();
    if (!originalName.endsWith(".jpg") && !originalName.endsWith(".jpeg")) {
      sendJson(response, 400, { error: "Only JPG/JPEG images are allowed." });
      return true;
    }

    // Check JPEG magic bytes (FF D8 FF)
    if (filePart.data[0] !== 0xFF || filePart.data[1] !== 0xD8 || filePart.data[2] !== 0xFF) {
      sendJson(response, 400, { error: "File does not appear to be a valid JPEG image." });
      return true;
    }

    // 5MB limit
    if (filePart.data.length > 5 * 1024 * 1024) {
      sendJson(response, 400, { error: "Image must be under 5MB." });
      return true;
    }

    const savedName = randomUUID().replaceAll("-", "") + ".jpg";
    const savedPath = path.join(uploadDirectory, savedName);
    await fs.writeFile(savedPath, filePart.data);

    sendJson(response, 200, { url: "/uploads/" + savedName });
    return true;
  }

  const deleteMatch = pathname.match(/^\/api\/forms\/(\d+)$/);
  if (deleteMatch && request.method === "DELETE") {
    const form = getFormById(deleteMatch[1]);
    if (!form) {
      sendJson(response, 404, { error: "Form not found." });
      return true;
    }
    deleteForm(form.id);
    sendJson(response, 200, { success: true });
    return true;
  }

  const closeMatch = pathname.match(/^\/api\/forms\/(\d+)\/close$/);
  if (closeMatch && request.method === "POST") {
    const form = getFormById(closeMatch[1]);
    if (!form) {
      sendJson(response, 404, { error: "Form not found." });
      return true;
    }
    closeForm(form.id);
    sendJson(response, 200, { success: true });
    return true;
  }

  const reopenMatch = pathname.match(/^\/api\/forms\/(\d+)\/reopen$/);
  if (reopenMatch && request.method === "POST") {
    const form = getFormById(reopenMatch[1]);
    if (!form) {
      sendJson(response, 404, { error: "Form not found." });
      return true;
    }
    reopenForm(form.id);
    sendJson(response, 200, { success: true });
    return true;
  }

  return false;
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost:3000");
  const pathname = requestUrl.pathname;
  const origin = getOrigin(request);

  try {
    // Static files — no auth needed
    if (pathname === "/styles.css") {
      await sendStaticFile(response, path.join(publicDirectory, "styles.css"));
      return;
    }
    if (pathname === "/admin.js") {
      await sendStaticFile(response, path.join(publicDirectory, "admin.js"));
      return;
    }
    if (pathname === "/form.js") {
      await sendStaticFile(response, path.join(publicDirectory, "form.js"));
      return;
    }

    // Serve uploaded images — public so they display in the form responses
    if (pathname.startsWith("/uploads/")) {
      const fileName = path.basename(pathname);
      const filePath = path.join(uploadDirectory, fileName);
      try {
        const content = await fs.readFile(filePath);
        response.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
        response.end(content);
      } catch {
        sendJson(response, 404, { error: "Image not found." });
      }
      return;
    }

    const site = await loadSiteConfig(siteConfigPath);

    // ---- Login page (GET) ----
    if (pathname === "/login" && request.method === "GET") {
      if (isAuthenticated(request)) {
        response.writeHead(302, { Location: "/dashboard" });
        response.end();
        return;
      }
      sendHtml(response, 200, renderLoginPage());
      return;
    }

    // ---- Login form submit (POST) ----
    if (pathname === "/login" && request.method === "POST") {
      const body = await readFormBody(request);
      const success = login(request, response, site, body.username?.trim(), body.password);
      if (success) {
        response.writeHead(302, { Location: "/dashboard" });
        response.end();
      } else {
        sendHtml(response, 401, renderLoginPage("Incorrect username or password. Please try again."));
      }
      return;
    }

    // ---- Logout ----
    if (pathname === "/logout") {
      logout(response);
      response.writeHead(302, { Location: "/login" });
      response.end();
      return;
    }

    // ---- API routes ----
    if (pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, pathname, origin);
      if (!handled) {
        sendJson(response, 404, { error: "API route not found." });
      }
      return;
    }

    // ---- Public landing page ----
    if (pathname === "/") {
      sendHtml(response, 200, renderLandingPage(site));
      return;
    }

    // ---- Protected dashboard ----
    if (pathname === "/dashboard") {
      if (!isAuthenticated(request)) {
        response.writeHead(302, { Location: "/login" });
        response.end();
        return;
      }
      sendHtml(response, 200, renderDashboardPage(site));
      return;
    }

    // ---- Public student form pages — no auth needed ----
    const publicPageMatch = pathname.match(/^\/f\/([A-Za-z0-9-]+)$/);
    if (publicPageMatch) {
      if (!getFormByPublicId(publicPageMatch[1])) {
        sendHtml(response, 404, renderNotFoundPage());
        return;
      }
      sendHtml(response, 200, renderPublicFormPage(site, publicPageMatch[1]));
      return;
    }

    sendHtml(response, 404, renderNotFoundPage());
  } catch (error) {
    console.error(error);
    if (pathname.startsWith("/api/")) {
      sendJson(response, 400, { error: error.message || "Something went wrong." });
      return;
    }
    sendHtml(
      response,
      500,
      `<!DOCTYPE html><html lang="en"><body><h1>Server error</h1><p>${error.message}</p></body></html>`
    );
  }
});

const port = Number(process.env.PORT || 3000);

server.listen(port, () => {
  console.log(`Finix Printing app running on http://localhost:${port}`);
});
