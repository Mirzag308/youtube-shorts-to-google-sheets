// Popup: settings save karta hai, content script ko Start/Stop bhejta hai,
// aur storage se live progress dikhata hai.

const $ = (id) => document.getElementById(id);

// Saved settings load karo.
(async function init() {
  const s = await chrome.storage.local.get(["webAppUrl", "limit", "progress"]);
  if (s.webAppUrl) $("webAppUrl").value = s.webAppUrl;
  if (s.limit) $("limit").value = s.limit;
  render(s.progress);
})();

$("start").addEventListener("click", async () => {
  const webAppUrl = $("webAppUrl").value.trim();
  let limit = parseInt($("limit").value, 10) || 1;
  limit = Math.max(1, Math.min(150, limit));

  if (!webAppUrl) {
    setStatus("Pehle Google Sheet Web App URL daalo.", true);
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/www\.youtube\.com\/shorts\//.test(tab.url || "")) {
    setStatus("Kisi channel ki Shorts (youtube.com/shorts/...) page kholo, phir Start.", true);
    return;
  }

  await chrome.storage.local.set({ webAppUrl, limit, stopRequested: false });

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "START", limit, webAppUrl });
    setStatus("Shuru ho gaya...");
  } catch (e) {
    setStatus("Content script load nahi hua. Shorts page ko ek dafa refresh (F5) karke dobara Start karo.", true);
  }
});

$("stop").addEventListener("click", async () => {
  await chrome.storage.local.set({ stopRequested: true });
  setStatus("Stop request bhej diya...");
});

// Storage badle to progress update karo (content script storage mein likhta hai).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.progress) render(changes.progress.newValue);
});

function render(p) {
  if (!p) return;
  if (p.status) setStatus(p.status, /error|fail/i.test(p.status));
  if (typeof p.done === "number") {
    $("progress").textContent = p.done + " / " + (p.total || "?") + " done";
  }
  if (p.last) $("last").textContent = p.last;
}

function setStatus(msg, isErr) {
  const el = $("status");
  el.textContent = msg;
  el.style.color = isErr ? "#ff8880" : "#9ad";
}
