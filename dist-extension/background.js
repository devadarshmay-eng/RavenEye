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

const EASY_OCR_ENDPOINTS = [
  "https://api.easyocr.org/ocr"
];

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

function extractTextFromEasyOcrResponse(payload) {
  const textChunks = [];

  const collect = (node) => {
    if (!node) return;

    if (typeof node === "string") {
      const cleaned = node.trim();
      if (cleaned) {
        textChunks.push(cleaned);
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }

    if (typeof node === "object") {
      const directKeys = ["text", "word", "lineText", "ParsedText"];
      directKeys.forEach((key) => {
        if (typeof node[key] === "string") {
          collect(node[key]);
        }
      });

      const nestedKeys = ["words", "lines", "result", "results", "data", "ocr", "paragraphs", "blocks"];
      nestedKeys.forEach((key) => {
        if (node[key] !== undefined) {
          collect(node[key]);
        }
      });
    }
  };

  collect(payload);
  return [...new Set(textChunks)].join("\n").trim();
}

async function requestEasyOcr(imageBlob) {
  let lastError;

  for (const endpoint of EASY_OCR_ENDPOINTS) {
    const formData = new FormData();
    formData.append("file", imageBlob, `raveneye-${Date.now()}.png`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`OCR service error (${response.status}).`);
      }

      const payload = await response.json();
      return extractTextFromEasyOcrResponse(payload);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("OCR service unavailable.");
}

async function handleOCR(dataUrl, sendResponse) {
  try {
    const imageBlob = await dataUrlToBlob(dataUrl);
    const text = await requestEasyOcr(imageBlob);
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
