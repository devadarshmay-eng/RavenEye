// RavenEye - Background Service Worker

chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-capture") {
    activateCapture().then((result) => {
      if (!result.success) {
        console.error("[RavenEye] Command activation failed:", result.error);
      }
    });
  }
});

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const tab = tabs[0];
      if (!tab || typeof tab.id !== "number") {
        reject(new Error("No active tab found."));
        return;
      }
      resolve(tab);
    });
  });
}

function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("devtools://")
  );
}

function sendTabMessage(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function injectCaptureAssets(tabId) {
  await Promise.all([
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    }),
    chrome.scripting.insertCSS({
      target: { tabId },
      files: ["raven-styles.css"]
    })
  ]);
}

async function activateCapture() {
  try {
    const tab = await getActiveTab();
    const url = tab.url || "";
    if (isRestrictedUrl(url)) {
      return {
        success: false,
        error: "RavenEye cannot run on browser internal pages. Open a normal website and try again."
      };
    }

    try {
      await sendTabMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
      return { success: true };
    } catch {
      await injectCaptureAssets(tab.id);
      await new Promise((resolve) => setTimeout(resolve, 120));
      await sendTabMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
      return { success: true };
    }
  } catch (error) {
    console.error("[RavenEye] Activation failed:", error);
    return { success: false, error: error.message || "Failed to start capture." };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ACTIVATE_FROM_POPUP") {
    activateCapture().then(sendResponse);
    return true;
  }

  if (message.action === "ACTIVATE_FROM_SHORTCUT") {
    activateCapture().then(sendResponse);
    return true;
  }

  if (message.action === "CAPTURE_REGION") {
    handleCapture(message, sender, sendResponse);
    return true; // async response
  }

  if (message.action === "RUN_OCR") {
    handleOCR(message.dataUrl, sendResponse);
    return true; // async response
  }

  if (message.action === "SAVE_IMAGE") {
    saveImage(message.dataUrl, message.filename);
    sendResponse({ success: true });
  }
});

async function handleCapture(message, sender, sendResponse) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: "png",
      quality: 100
    });
    sendResponse({ success: true, dataUrl, region: message.region });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

const DEFAULT_OCR_SETTINGS = {
  ocrRelayUrl: ""
};

function getStoredOcrSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_OCR_SETTINGS, (settings) => {
      resolve(settings || DEFAULT_OCR_SETTINGS);
    });
  });
}

function normalizeRelayUrl(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function extractRelayText(payload) {
  if (!payload || typeof payload !== "object") return "";

  const candidates = [
    payload.text,
    payload.ocrText,
    payload.extractedText,
    payload?.data?.text,
    payload?.result?.text
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function extractRelayError(payload) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = [
    payload.error,
    payload.message,
    payload?.data?.error,
    payload?.result?.error
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

async function requestOcrRelay(dataUrl, relayUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("Invalid capture data.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(relayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        imageDataUrl: dataUrl,
        language: "eng"
      }),
      signal: controller.signal
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const providerMessage = extractRelayError(payload);
      if (response.status === 401 || response.status === 403) {
        throw new Error(providerMessage || "OCR relay authentication failed. Check relay secret configuration.");
      }
      if (response.status === 429) {
        throw new Error(providerMessage || "OCR relay rate limit reached. Please retry in a moment.");
      }
      throw new Error(providerMessage || `OCR relay error (${response.status}).`);
    }

    const text = extractRelayText(payload);
    if (text) return text;

    const providerMessage = extractRelayError(payload);
    if (providerMessage) {
      throw new Error(providerMessage);
    }

    throw new Error("OCR relay could not extract text from this capture.");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleOCR(dataUrl, sendResponse) {
  try {
    const settings = await getStoredOcrSettings();
    const relayUrl = normalizeRelayUrl(settings.ocrRelayUrl);
    if (!relayUrl) {
      throw new Error("OCR relay URL is not configured. Set it in RavenEye settings.");
    }

    const text = await requestOcrRelay(dataUrl, relayUrl);
    sendResponse({ success: true, text });
  } catch (error) {
    console.error('[RavenEye] OCR Error:', error);
    sendResponse({
      success: false,
      error: error.message || "OCR failed. Please check your connection and try again."
    });
  }
}

function saveImage(dataUrl, filename) {
  chrome.downloads.download({
    url: dataUrl,
    filename: filename || `raveneye-${Date.now()}.png`,
    saveAs: false
  });
}
