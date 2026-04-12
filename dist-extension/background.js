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

const OCR_PROVIDER_ENDPOINT = "https://api.ocr.space/parse/image";
const OCR_PROVIDER_SHARED_KEY = "helloworld";

async function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("Invalid capture data.");
  }

  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Failed to prepare capture image.");
  }

  return response.blob();
}

async function requestOcrSpace(imageBlob) {
  const formData = new FormData();
  formData.append("apikey", OCR_PROVIDER_SHARED_KEY);
  formData.append("file", imageBlob, `raveneye-${Date.now()}.png`);
  formData.append("language", "eng");
  formData.append("isOverlayRequired", "false");
  formData.append("scale", "true");
  formData.append("OCREngine", "2");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(OCR_PROVIDER_ENDPOINT, {
      method: "POST",
      body: formData,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OCR provider error (${response.status}).`);
    }

    const payload = await response.json();
    if (payload?.OCRExitCode === 1 && Array.isArray(payload.ParsedResults)) {
      const extracted = payload.ParsedResults
        .map((entry) => (entry?.ParsedText || "").trim())
        .filter(Boolean)
        .join("\n")
        .trim();
      return extracted;
    }

    if (payload?.OCRExitCode === 3) {
      throw new Error("OCR provider rate limit reached. Please retry in a moment.");
    }

    throw new Error("OCR provider could not extract text from this capture.");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleOCR(dataUrl, sendResponse) {
  try {
    const imageBlob = await dataUrlToBlob(dataUrl);
    const text = await requestOcrSpace(imageBlob);
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
