import { importPKCS8, SignJWT } from "jose";

export function isAppsScriptBridgeUrl(value: string) {
  return /script\.google\.com\/macros\/s\//i.test(value.trim());
}

/**
 * Download tracker bytes from:
 * 1) Apps Script bridge URL (free, no Google Cloud Console)
 * 2) Service account Drive export
 * 3) Anonymous Google /export URL
 */
export async function downloadTrackerSource(
  sourceUrl: string,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; message: string }> {
  const trimmed = sourceUrl.trim();
  if (isAppsScriptBridgeUrl(trimmed)) {
    return downloadViaAppsScriptBridge(trimmed);
  }

  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const spreadsheetId = idMatch?.[1] || (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed) ? trimmed : null);
  if (!spreadsheetId) {
    return { ok: false, message: "Paste the Google Sheet link or the Apps Script web app URL." };
  }
  return downloadGoogleSheetXlsx(spreadsheetId);
}

export async function downloadGoogleSheetXlsx(
  spreadsheetId: string,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; message: string }> {
  const authed = await downloadWithServiceAccount(spreadsheetId);
  if (authed) return authed;

  try {
    const response = await fetch(
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=xlsx`,
      { redirect: "follow", signal: AbortSignal.timeout(60_000) },
    );
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || type.includes("text/html") || type.includes("application/json")) {
      return {
        ok: false,
        message:
          "Direct Google Sheet export is blocked. Use the free Apps Script bridge on the Import page (no Google Cloud billing), or a service account.",
      };
    }
    return { ok: true, bytes: Buffer.from(await response.arrayBuffer()) };
  } catch {
    return { ok: false, message: "The case tracker could not be reached." };
  }
}

async function downloadViaAppsScriptBridge(
  url: string,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; message: string }> {
  try {
    const target = new URL(url);
    const expected = process.env.TRACKER_BRIDGE_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
    if (expected && !target.searchParams.get("key")) {
      target.searchParams.set("key", expected);
    }
    const response = await fetch(target.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(90_000),
    });
    const text = await response.text();
    let json: { ok?: boolean; xlsx?: string; message?: string };
    try {
      json = JSON.parse(text) as { ok?: boolean; xlsx?: string; message?: string };
    } catch {
      return {
        ok: false,
        message:
          "Apps Script did not return JSON. Redeploy the web app (Execute as: Me, Who has access: Anyone) and paste the /exec URL.",
      };
    }
    if (!json.ok || !json.xlsx) {
      return { ok: false, message: json.message || "Apps Script bridge rejected the request (check the key)." };
    }
    return { ok: true, bytes: Buffer.from(json.xlsx, "base64") };
  } catch {
    return { ok: false, message: "Could not reach the Apps Script bridge URL." };
  }
}

async function downloadWithServiceAccount(
  spreadsheetId: string,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; message: string } | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!email || !rawKey) return null;

  try {
    const token = await serviceAccountAccessToken(email, rawKey);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      if (response.status === 404 || body.includes("File not found")) {
        return {
          ok: false,
          message: `Sheet not found for the service account. Share the Google Sheet with ${email} as Viewer, then Save and sync again.`,
        };
      }
      return {
        ok: false,
        message: `Google Drive export failed (${response.status}). Share the sheet with ${email} as Viewer and enable the Google Drive API.`,
      };
    }
    return { ok: true, bytes: Buffer.from(await response.arrayBuffer()) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google auth failed";
    return { ok: false, message: `Google service account error: ${message}` };
  }
}

async function serviceAccountAccessToken(email: string, rawKey: string) {
  const key = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  const cryptoKey = await importPKCS8(key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/drive.readonly",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(cryptoKey);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`token exchange failed (${response.status})`);
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("no access_token returned");
  return json.access_token;
}
