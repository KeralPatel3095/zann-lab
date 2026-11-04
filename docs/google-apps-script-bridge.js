/**
 * Paste into: Google Sheet → Extensions → Apps Script
 * Then Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Copy the Web app URL into Import on the lab site, with ?key=YOUR_SECRET appended.
 * Example: https://script.google.com/macros/s/XXXX/exec?key=YOUR_SECRET
 *
 * Set the same YOUR_SECRET in Netlify as TRACKER_BRIDGE_SECRET (or reuse CRON_SECRET).
 */
var BRIDGE_SECRET = "YOUR_SECRET"; // change this

function doGet(e) {
  var key = e && e.parameter ? e.parameter.key : "";
  if (key !== BRIDGE_SECRET) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, message: "Invalid key" }),
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var id = ss.getId();
  var exportUrl =
    "https://docs.google.com/spreadsheets/d/" + id + "/export?format=xlsx";
  var response = UrlFetchApp.fetch(exportUrl, {
    muteHttpExceptions: true,
    followRedirects: true,
  });

  if (response.getResponseCode() >= 400) {
    return ContentService.createTextOutput(
      JSON.stringify({
        ok: false,
        message: "Export failed: " + response.getResponseCode(),
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var b64 = Utilities.base64Encode(response.getBlob().getBytes());
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, xlsx: b64, spreadsheetId: id }),
  ).setMimeType(ContentService.MimeType.JSON);
}
