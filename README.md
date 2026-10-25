# YouTube Shorts to Google Sheets

A Manifest V3 browser extension that collects YouTube Shorts links, titles, view
counts, descriptions, and available transcripts, then appends each result to a
Google Sheet through a Google Apps Script web app that you deploy.

The extension runs locally in your desktop browser. It does not use a separate
scraping service or require a paid API. YouTube's page layout and transcript
availability can change, so results are not guaranteed for every video.

![YouTube Shorts to Google Sheets workflow](YouTube%20Transcript%20to%20Sheets%20Flow.png)

## Features

- Collects up to 150 Shorts from the open Shorts page.
- Reads video metadata and tries to retrieve transcript text available in
  YouTube's rendered transcript panel.
- Sends one row per video to your Google Sheet.
- Shows progress and lets you request that processing stop.
- Keeps the configured Apps Script URL and limit in the browser's local
  extension storage.

## Technologies

- JavaScript, HTML, and CSS
- Chrome Extensions Manifest V3: popup, content script, and service worker
- Chrome tabs and scripting APIs
- Google Apps Script and Google Sheets
- YouTube's rendered web interface (no YouTube Data API key)

## Compatibility

| Platform | Supported setup |
| --- | --- |
| Windows 10/11 | Current desktop Google Chrome or Microsoft Edge |
| macOS (including MacBook) | Current desktop Google Chrome or Microsoft Edge |
| Linux desktop | Current desktop Google Chrome or Microsoft Edge |

The operating system does not need a separate build: the extension is plain
JavaScript and is loaded as an unpacked extension. Firefox and Safari are not
supported by this project. This repository does not publish the extension to
the Chrome Web Store or Microsoft Edge Add-ons.

## Requirements

- A desktop installation of Chrome or Edge.
- A Google account and a Google Sheet where you want to save results.
- Access to the YouTube Shorts page you want to process.
- Permission to create and deploy a Google Apps Script web app.

## Setup

### 1. Create the Google Sheets receiver

1. Create a blank spreadsheet at [sheets.new](https://sheets.new).
2. In the spreadsheet, choose **Extensions → Apps Script**.
3. Replace the editor contents with [`google-apps-script/Code.gs`](google-apps-script/Code.gs) and save.
4. Choose **Deploy → New deployment**, select **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Deploy and complete Google's authorization steps.
6. Copy the web app URL ending in `/exec`. Opening it in a browser should show
   `YT Shorts Extractor endpoint zinda hai.`

The web app must accept requests without a Google sign-in because the extension
posts to it directly. Anyone who obtains its URL may be able to submit data to
the spreadsheet through this receiver. Keep the URL private, and redeploy or
change access if it is exposed. Review Google's Apps Script quotas and access
settings for your account.

### 2. Install the extension

Download this repository using **Code → Download ZIP** on GitHub and extract it.
The folder you load must contain `manifest.json` at its top level.

**Google Chrome (Windows, macOS, or Linux)**

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose the extracted project folder.
4. Optionally pin **YT Shorts Extractor** from Chrome's Extensions menu.

**Microsoft Edge (Windows, macOS, or Linux)**

1. Open `edge://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose the extracted project folder.
4. Optionally pin the extension from Edge's Extensions menu.

No installer or platform-specific package is needed. When updating the source,
reload the extension from its extensions page and refresh the YouTube tab.

### 3. Extract Shorts

1. Open the Shorts page for a channel or playlist. Start from a Shorts URL such
   as `https://www.youtube.com/shorts/VIDEO_ID`.
2. Refresh the page once after installing or reloading the extension.
3. Open the extension popup, paste the Apps Script web app URL, and choose a
   limit from 1 to 150.
4. Select **Start**. The extension collects Shorts IDs, then opens/reuses a
   worker tab to read each video's metadata and transcript.
5. Check the progress in the popup and the resulting rows in your spreadsheet.
   Select **Stop** to request that processing stop.

The worker tab may briefly come to the foreground while videos are processed.
YouTube may not provide transcript text for every video; unavailable or failed
transcript reads are reported as `no transcript`.

## Spreadsheet columns

The Apps Script receiver creates a header row when the sheet is empty:

| Column | Value |
| --- | --- |
| Link | YouTube Shorts URL |
| Title | Video title |
| Views | View count exposed by the page |
| Description | Video description exposed by the page |
| Transcript | Retrieved text, or `no transcript` |
| Extracted At | Timestamp written by Apps Script |

## How it works

1. The content script reads the current Short ID and advances through Shorts to
   collect unique IDs up to the selected limit.
2. The service worker opens each video in a worker tab and injects a script
   into YouTube's page to read available metadata and the rendered transcript.
3. The worker sends each result to the configured Apps Script URL. Apps Script
   appends it to the first sheet in the spreadsheet.
4. The worker tab is closed and focus returns to the original Shorts tab.

## Permissions and data

- `storage`: saves the web app URL, limit, and progress locally in the browser.
- `tabs`: checks the active Shorts page and opens/reuses the worker tab.
- `scripting`: reads the YouTube page to collect metadata and rendered
  transcript text.
- YouTube host access: enables the content script and worker-page access.
- Google Apps Script host access: sends the extracted row to your configured
  receiver.

Extracted video data is sent to the Apps Script URL that you enter. This project
does not include a developer-operated collection server, analytics, or a
preconfigured spreadsheet endpoint. The Apps Script deployment runs under the
Google account and access settings you select. Do not enter a web app URL that
you do not trust.

## Project files

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 extension configuration and permissions |
| `popup.html`, `popup.css`, `popup.js` | Settings, controls, and progress display |
| `content.js` | Shorts-page navigation and video ID collection |
| `background.js` | Worker-tab processing, page scraping, and Sheet POST |
| `google-apps-script/Code.gs` | Google Sheets web app receiver |
| `icons/` | Extension toolbar and listing icons |

## Troubleshooting

| Issue | What to try |
| --- | --- |
| The popup says the content script did not load | Refresh the Shorts page, then try again. |
| The extension says the active page is not a Shorts page | Open a URL under `youtube.com/shorts/` in the active tab. |
| A row says `no transcript` | Check whether that video has a transcript in YouTube. YouTube's interface and availability vary by video, region, and account. |
| No row appears in the Sheet | Check the `/exec` URL, confirm the deployment is active and permits access, then test the URL in a browser. |
| Shorts navigation or transcript extraction stops working | YouTube may have changed its page layout; inspect the selectors in `content.js` or `background.js`. |
| The extension does not appear after loading | Confirm you selected the extracted project folder containing `manifest.json`, and check the browser's extensions page for errors. |

## Responsible use

Use this tool only where you have the right to access and process the content.
You are responsible for complying with YouTube's terms, applicable law,
copyright, privacy, and Google Apps Script policies. Keep extraction limits
reasonable. This project is an unofficial community tool and is not affiliated
with YouTube or Google.

## License

No license is included. The source is publicly viewable, but reuse,
redistribution, and modification are not granted by a license. Contact the
repository owner for permission.
