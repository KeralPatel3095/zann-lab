/**
 * PERMANENT live sync (free, no Google Cloud).
 *
 * 1) Extensions → Apps Script (from the tracker sheet, or any Apps Script project)
 * 2) Paste this file
 * 3) Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 4) Authorize
 * 5) Import on the lab site:
 *      https://script.google.com/macros/s/XXXX/exec?key=K5vxmVhWwLJOfy7iAdTazN8Q6cpn3jCE1GZeRsI9XHtPMo4k
 *
 * After code changes: Manage deployments → Edit → New version → Deploy
 */
var BRIDGE_SECRET = "K5vxmVhWwLJOfy7iAdTazN8Q6cpn3jCE1GZeRsI9XHtPMo4k";

// Your tracker Google Sheet ID (copy from browser URL: /spreadsheets/d/THIS_PART/edit)
// Current lab sheet:
var SHEET_ID = "1A5K8GUtiujYmkwKKHkzXdalhcpnRySECIq18bCKpczQ";

function doGet(e) {
  try {
    var key = e && e.parameter ? String(e.parameter.key || "") : "";
    if (key !== BRIDGE_SECRET) {
      return jsonOut({ ok: false, message: "Invalid key" });
    }

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheets = ss.getSheets();
    var out = [];
    var keep = /january|february|march|april|may|june|july|august|september|october|november|december|pickup/i;

    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var name = sheet.getName();
      if (!keep.test(name)) continue;
      var values = sheet.getDataRange().getDisplayValues();
      out.push({ name: name, values: values });
    }

    if (!out.length) {
      return jsonOut({
        ok: false,
        message: "No month/pickup tabs found. Tab names must include a month (e.g. November) or Pickup.",
      });
    }

    return jsonOut({
      ok: true,
      sheets: out,
      title: ss.getName(),
      tabCount: out.length,
    });
  } catch (err) {
    return jsonOut({ ok: false, message: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
