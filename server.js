import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createForm, createResponse, getFormById, getFormByPublicId, listForms, listResponses } from "./lib/database.js";
import { renderDashboardPage, renderLandingPage, renderNotFoundPage, renderPublicFormPage } from "./lib/templates.js";
import {
  buildExcelWorkbookXml,
  buildResponseTable,
  normalizeAnswers,
  readJsonBody,
  readSiteConfig,
  sanitizeFormPayload,
  sendHtml,
  sendJson,
  sendStaticFile
} from "./lib/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteConfigPath = path.join(__dirname, "data", "site-config.json");
const publicDirectory = path.join(__dirname, "public");

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

async function handleApi(request, response, pathname, origin) {
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

  const exportMatch = pathname.match(/^\/api\/forms\/(\d+)\/export\.xls$/);

  if (exportMatch && request.method === "GET") {
    const form = getFormById(exportMatch[1]);

    if (!form) {
      sendJson(response, 404, { error: "Form not found." });
      return true;
    }

    const workbook = buildExcelWorkbookXml(form, listResponses(form.id));
    const fileName = `${form.title.replace(/[^\w-]+/g, "-").toLowerCase() || "responses"}-responses.xls`;

    response.writeHead(200, {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    });
    response.end(workbook);
    return true;
  }

  const publicFormMatch = pathname.match(/^\/api\/public\/forms\/([A-Za-z0-9-]+)$/);

  if (publicFormMatch && request.method === "GET") {
    const form = getFormByPublicId(publicFormMatch[1]);

    if (!form) {
      sendJson(response, 404, { error: "This form link is no longer available." });
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

    const payload = await readJsonBody(request);
    const answers = normalizeAnswers(form, payload.answers);
    const savedResponse = createResponse(form.id, answers);

    sendJson(response, 201, { response: savedResponse });
    return true;
  }

  return false;
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost:3000");
  const pathname = requestUrl.pathname;
  const origin = getOrigin(request);

  try {
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

    if (pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, pathname, origin);

      if (!handled) {
        sendJson(response, 404, { error: "API route not found." });
      }

      return;
    }

    const site = await readSiteConfig(siteConfigPath);

    if (pathname === "/") {
      sendHtml(response, 200, renderLandingPage(site));
      return;
    }

    if (pathname === "/dashboard") {
      sendHtml(response, 200, renderDashboardPage(site));
      return;
    }

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
