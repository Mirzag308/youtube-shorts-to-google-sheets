/**
 * YT Shorts Extractor — Google Sheet receiver.
 *
 * Ye code apni Google Sheet ke Apps Script editor mein paste karein,
 * phir "Deploy > New deployment > Web app" se deploy karein.
 * (Setup ke poore steps README.md mein hain.)
 *
 * Extension har short ka data yahan POST karti hai aur ye uski ek nayi row
 * active sheet mein add kar deta hai.
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // ek waqt mein ek hi row likhe (race se bachao)

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // Header pehli dafa khud ban jaye.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Link", "Title", "Views", "Description", "Transcript", "Extracted At"]);
    }

    var data = JSON.parse(e.postData.contents);

    sheet.appendRow([
      data.link || "",
      data.title || "",
      data.views || "",
      data.description || "",
      data.transcript || "",
      new Date()
    ]);
    sheet.getRange(sheet.getLastRow(), 5).setWrap(true);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// Browser mein URL kholne par test ke liye.
function doGet() {
  return ContentService.createTextOutput("YT Shorts Extractor endpoint zinda hai.");
}
