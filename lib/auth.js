import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Secret key for signing session tokens.
// In production set SESSION_SECRET env variable to a long random string.
const SESSION_SECRET = process.env.SESSION_SECRET || "finix-printing-secret-change-in-prod";
const COOKIE_NAME = "fp_session";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours in seconds

// ---------- token helpers ----------

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- cookie helpers ----------

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );
}

function setSessionCookie(response, token) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}; Path=/`
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/`
  );
}

// ---------- public API ----------

export function isAuthenticated(request) {
  const cookies = parseCookies(request);
  const token = cookies[COOKIE_NAME];
  const payload = verify(token);
  return payload !== null && payload.auth === true;
}

export function createSessionToken() {
  return sign({ auth: true, exp: Date.now() + COOKIE_MAX_AGE * 1000, nonce: randomBytes(8).toString("hex") });
}

export function login(request, response, site, username, password) {
  if (username === site.adminUsername && password === site.adminPassword) {
    setSessionCookie(response, createSessionToken());
    return true;
  }
  return false;
}

export function logout(response) {
  clearSessionCookie(response);
}
