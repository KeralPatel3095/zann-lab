/**
 * PERMANENT live sync (free, no Google Cloud).
 *
 * 1) Tracker Google Sheet → Extensions → Apps Script
 * 2) Replace all code with this file
 * 3) Set BRIDGE_SECRET to your Netlify CRON_SECRET
 * 4) Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 5) Authorize when asked
 * 6) Copy the /exec URL into Import as:
 *      https://script.google.com/macros/s/XXXX/exec?key=YOUR_SECRET
 *
 * After any code change: Deploy → Manage deployments → Edit → New version → Deploy
 */
var BRIDGE_SECRET = "K5vxmVhWwLJOfy7iAdTazN8Q6cpn3jCE1GZeRsI9XHtPMo4k";

function doGet(e) {
  try {
    var key = e && e.parameter ? String(e.parameter.key || "") : "";
    if (key !== BRIDGE_SECRET) {
      return jsonOut({ ok: false, message: "Invalid key" });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    var out = [];
    var keep = /january|february|march|april|may|june|july|august|september|october|november|december|pickup/i;

    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var name = sheet.getName();
      if (!keep.test(name)) continue;
      var range = sheet.getDataRange();
      var values = range.getDisplayValues();
      out.push({ name: name, values: values });
    }

    if (!out.length) {
      return jsonOut({ ok: false, message: "No month/pickup tabs found in this spreadsheet." });
    }

    return jsonOut({ ok: true, sheets: out, title: ss.getName() });
  } catch (err) {
    return jsonOut({ ok: false, message: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
