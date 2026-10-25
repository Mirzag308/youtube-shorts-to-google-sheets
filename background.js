// Service worker: har video ko ek worker tab mein khol kar YouTube ke apne
// "Show transcript" button se transcript (+ title/views/description) nikaalta hai,
// phir Google Sheet mein row likhta hai. (Ye hi wo tareeqa hai jo aapne manually
// kaam karte dekha — kyunke button YouTube ki apni secure request chalata hai.)

let workerTabId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "PROCESS_ALL") {
    const shortsTabId = sender.tab ? sender.tab.id : null;
    processAll(msg.ids, msg.webAppUrl, shortsTabId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true;
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setProg(patch) {
  const cur = (await chrome.storage.local.get("progress")).progress || {};
  await chrome.storage.local.set({ progress: Object.assign({}, cur, patch) });
}
async function isStopRequested() {
  return !!(await chrome.storage.local.get("stopRequested")).stopRequested;
}

async function processAll(ids, webAppUrl, shortsTabId) {
  let done = 0;
  let okT = 0;

  try {
    for (const id of ids) {
      if (await isStopRequested()) break;

      let data;
      try {
        data = await scrapeVideo(id);
      } catch (e) {
        data = { title: "", views: "", description: "", transcript: "no transcript" };
      }

      const row = {
        link: "https://www.youtube.com/shorts/" + id,
        title: data.title,
        views: data.views,
        description: data.description,
        transcript: data.transcript
      };
      let saveErr = "";
      try {
        await postToSheet(webAppUrl, row);
      } catch (e) {
        saveErr = String(e && e.message ? e.message : e);
      }

      done++;
      const hasT = data.transcript && data.transcript !== "no transcript";
      if (hasT) okT++;
      await setProg({
        done: done,
        total: ids.length,
        status: "transcript nikal rahe hain...",
        last:
          (saveErr ? "✗ sheet: " + saveErr + " | " : "") +
          (data.title || id) +
          " — " +
          (hasT ? "transcript OK" : "no transcript")
      });
    }
  } finally {
    // cleanup: worker tab band, shorts tab wapas focus.
    if (workerTabId != null) {
      try {
        await chrome.tabs.remove(workerTabId);
      } catch (e) {}
      workerTabId = null;
    }
    if (shortsTabId != null) {
      try {
        await chrome.tabs.update(shortsTabId, { active: true });
      } catch (e) {}
    }
  }

  return { ok: true, done: done, okT: okT };
}

// Ek video ka data worker tab se nikaalo.
async function scrapeVideo(id) {
  const url = "https://www.youtube.com/watch?v=" + id + "&hl=en";

  // Worker tab ready karo (ek hi tab reuse karte hain).
  let ok = false;
  if (workerTabId != null) {
    try {
      await chrome.tabs.update(workerTabId, { url: url, active: true });
      ok = true;
    } catch (e) {
      workerTabId = null;
    }
  }
  if (!ok) {
    const t = await chrome.tabs.create({ url: url, active: true });
    workerTabId = t.id;
  }

  await waitTabComplete(workerTabId, 30000);
  await sleep(1500); // Polymer app ko render hone do

  const results = await chrome.scripting.executeScript({
    target: { tabId: workerTabId },
    world: "MAIN", // page globals (ytInitialPlayerResponse) tak pohonch ke liye
    func: scrapeInPage
  });

  const out = results && results[0] ? results[0].result : null;
  return out || { title: "", views: "", description: "", transcript: "no transcript" };
}

// Ye watch page ke andar (MAIN world) chalta hai.
async function scrapeInPage() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));

  // Meta: player response se (exact).
  let title = "",
    views = "",
    description = "";
  try {
    const pr = window.ytInitialPlayerResponse;
    if (pr && pr.videoDetails) {
      title = pr.videoDetails.title || "";
      views = pr.videoDetails.viewCount || "";
      description = pr.videoDetails.shortDescription || "";
    }
  } catch (e) {}

  // Video mute + pause (shor aur load kam).
  try {
    const v = q("video");
    if (v) {
      v.muted = true;
      v.pause();
    }
  } catch (e) {}

  // Description/metadata render hone ka intezaar.
  for (let i = 0; i < 50; i++) {
    if (q("ytd-watch-metadata, #description-inline-expander, #description")) break;
    await sleep(300);
  }

  // "...more" expand karo.
  const exp =
    q("tp-yt-paper-button#expand") ||
    q("#description-inline-expander #expand") ||
    q("#description #expand") ||
    q("#expand");
  if (exp) {
    exp.click();
    await sleep(800);
  }

  // Agar meta player response se na mila to DOM se title le lo.
  if (!title) {
    const h1 = q("ytd-watch-metadata h1 yt-formatted-string, #title h1");
    if (h1) title = (h1.textContent || "").trim();
  }

  // "Show transcript" button dhoondo.
  function findBtn() {
    const direct = q("ytd-video-description-transcript-section-renderer button");
    if (direct) return direct;
    for (const el of qa("button, ytd-button-renderer, yt-button-shape button")) {
      const t = ((el.getAttribute && el.getAttribute("aria-label")) || "") + " " + (el.textContent || "");
      if (/transcript/i.test(t)) return el;
    }
    return null;
  }

  let btn = null;
  for (let i = 0; i < 40; i++) {
    btn = findBtn();
    if (btn) break;
    await sleep(300);
  }

  let transcript = "";
  if (btn) {
    btn.click();

    // Naya YouTube: transcript-segment-view-model. (Purana: ytd-transcript-segment-renderer.)
    const SEG_SEL = "transcript-segment-view-model, ytd-transcript-segment-renderer";

    // Segments ke aane ka intezaar (max ~20s).
    let segs = [];
    for (let i = 0; i < 65; i++) {
      await sleep(300);
      segs = qa(SEG_SEL);
      if (segs.length) break;
    }

    if (segs.length) {
      await sleep(1000); // saare segments load hone do
      segs = qa(SEG_SEL);
      const parts = [];
      for (const s of segs) {
        let t = "";
        // Naya layout: caption text link-inherit-color spans mein (timestamp alag).
        const spans = s.querySelectorAll(".ytAttributedStringLinkInheritColor");
        if (spans.length) {
          t = Array.from(spans)
            .map((x) => x.innerText || x.textContent || "")
            .join(" ")
            .trim();
        }
        // Purana layout.
        if (!t) {
          const st = s.querySelector(".segment-text, yt-formatted-string.segment-text");
          if (st) t = (st.innerText || st.textContent || "").trim();
        }
        // Aakhri fallback: poora text minus leading timestamp (jaise "0:12 ...").
        if (!t) {
          const full = (s.innerText || s.textContent || "").trim();
          t = full.replace(/^\d{1,2}:\d{2}(:\d{2})?\s*/, "").trim();
        }
        if (t) parts.push(t);
      }
      transcript = parts
        .map((part) => part.replace(/\s+/g, " ").trim())
        .join("\n")
        .trim();
    }
  }
  if (!transcript) transcript = "no transcript";

  return { title: title, views: views, description: description, transcript: transcript };
}

function waitTabComplete(tabId, timeout) {
  return new Promise((resolve) => {
    const start = Date.now();
    function check() {
      chrome.tabs.get(tabId, (t) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        if (t && t.status === "complete") {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeout) {
          resolve(true);
          return;
        }
        setTimeout(check, 300);
      });
    }
    check();
  });
}

async function postToSheet(url, row) {
  if (!url) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(row),
    redirect: "follow"
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
}
