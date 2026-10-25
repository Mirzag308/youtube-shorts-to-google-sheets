// Content script (Shorts page). Do phase:
//   Phase 1: shorts pe scroll karke N video IDs collect karo (fast).
//   Phase 2: background ko IDs bhej do -> wo har video ko worker tab mein khol kar
//            "Show transcript" se transcript + meta nikaalta hai aur Sheet mein likhta hai.

let running = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "START") {
    runExtraction(msg.limit, msg.webAppUrl);
    sendResponse({ ok: true });
  }
  if (msg && msg.type === "IS_READY") {
    sendResponse({ ready: true, onShorts: !!getShortId() });
  }
  return true;
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getShortId() {
  const m = location.pathname.match(/\/shorts\/([\w-]+)/);
  return m ? m[1] : null;
}

async function setProg(patch) {
  const cur = (await chrome.storage.local.get("progress")).progress || {};
  await chrome.storage.local.set({ progress: Object.assign({}, cur, patch) });
}

async function isStopRequested() {
  return !!(await chrome.storage.local.get("stopRequested")).stopRequested;
}

/* -------------------- Shorts navigation -------------------- */

function clickNext() {
  const btn = document.querySelector(
    "#navigation-button-down button, " +
      "#navigation-button-down ytd-button-renderer button, " +
      "ytd-shorts [aria-label='Next video'], " +
      "button[aria-label='Next video'], " +
      "button[aria-label='Next Short']"
  );
  if (btn) {
    btn.click();
    return;
  }
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", keyCode: 40, which: 40, bubbles: true })
  );
  const container = document.querySelector("#shorts-container, ytd-shorts");
  if (container) container.scrollBy(0, window.innerHeight);
  else window.scrollBy(0, window.innerHeight);
}

async function goNext(prevId) {
  clickNext();
  for (let i = 0; i < 60; i++) {
    await sleep(150);
    const id = getShortId();
    if (id && id !== prevId) {
      await sleep(500);
      return true;
    }
    if (i === 20) clickNext();
  }
  return false;
}

/* -------------------- Main -------------------- */

async function runExtraction(limit, webAppUrl) {
  if (running) return;
  running = true;

  limit = Math.max(1, Math.min(150, parseInt(limit, 10) || 1));
  await chrome.storage.local.set({ stopRequested: false });
  await setProg({ done: 0, total: limit, status: "IDs collect ho rahi hain...", last: "" });

  try {
    // ---- Phase 1: collect IDs by scrolling ----
    const ids = [];
    for (let n = 0; n < limit; n++) {
      if (await isStopRequested()) break;

      const id = getShortId();
      if (!id) {
        await setProg({ status: "error: Shorts page par nahi ho" });
        break;
      }
      if (ids.indexOf(id) === -1) ids.push(id);
      await setProg({ done: ids.length, total: limit, status: "IDs collect: " + ids.length + "/" + limit });

      if (n < limit - 1) {
        const moved = await goNext(id);
        if (!moved) break; // aur shorts nahi
        await sleep(1000);
      }
    }

    if (!ids.length) {
      await setProg({ status: "koi short ID nahi mili" });
      return;
    }

    // ---- Phase 2: background process (worker tab + Show transcript) ----
    await setProg({ done: 0, total: ids.length, status: "transcript nikal rahe hain...", last: "" });
    const res = await chrome.runtime.sendMessage({ type: "PROCESS_ALL", ids: ids, webAppUrl: webAppUrl });
    if (res && res.ok) {
      await setProg({ status: "done ✔ (" + res.okT + "/" + res.done + " transcripts)" });
    } else {
      await setProg({ status: "error: " + (res && res.error ? res.error : "process fail") });
    }
  } finally {
    running = false;
    await chrome.storage.local.set({ stopRequested: false });
  }
}
