// RavenEye Firefox background page.

let ocrWorkerPromise;
let latestPendingCapture = null;

function getErrorMessage(error, fallback) {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  if (error && typeof error.type === "string") {
    const location = error.filename ? ` (${error.filename}:${error.lineno || 0})` : "";
    return `${error.type}${location}`;
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Keep the stable fallback for values that cannot be serialized.
  }
  return fallback;
}

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

function isPdfOrRestrictedTab(tab) {
  if (!tab) return false;
  const url = (tab.url || "").toLowerCase();
  const title = (tab.title || "").toLowerCase();
  if (url.endsWith(".pdf") || url.includes(".pdf?") || url.includes(".pdf#")) return true;
  if (title.endsWith(".pdf")) return true;
  if (url.startsWith("file://") && url.endsWith(".pdf")) return true;
  if (url.startsWith("resource://pdf.js") || url.startsWith("about:reader")) return true;
  return false;
}

async function startFallbackCapture(tab) {
  try {
    const targetTab = tab || (await getActiveTab());
    const dataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(targetTab.windowId, { format: "png", quality: 100 }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!result) {
          reject(new Error("Could not capture tab screenshot."));
          return;
        }
        resolve(result);
      });
    });

    const captureId = `cap_${Date.now()}`;
    latestPendingCapture = {
      dataUrl,
      sourceUrl: targetTab.url || "",
      sourceTitle: targetTab.title || "",
      timestamp: Date.now()
    };

    if (chrome.storage?.local) {
      chrome.storage.local.set({
        [captureId]: latestPendingCapture,
        latestCaptureId: captureId
      });
    }

    const captureUrl = chrome.runtime.getURL(`capture.html?id=${captureId}`);
    await new Promise((resolve, reject) => {
      chrome.tabs.create({ url: captureUrl, active: true }, (createdTab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(createdTab);
      });
    });

    return { success: true };
  } catch (error) {
    console.error("[RavenEye] Fallback capture failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to capture document view.")
    };
  }
}

async function activateCapture() {
  try {
    const tab = await getActiveTab();
    const url = tab.url || "";
    if (/^(chrome|edge|about|devtools|moz-extension):\/\//i.test(url) && !url.startsWith("about:reader")) {
      return {
        success: false,
        error: "RavenEye cannot run on browser internal pages."
      };
    }

    // Direct fallback for PDF documents and special readers
    if (isPdfOrRestrictedTab(tab)) {
      return await startFallbackCapture(tab);
    }

    try {
      await sendTabMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
      return { success: true };
    } catch {
      try {
        await chrome.tabs.executeScript(tab.id, { file: "content.js" });
        await chrome.tabs.insertCSS(tab.id, { file: "raven-styles.css" });
        await new Promise((resolve) => setTimeout(resolve, 120));
        await sendTabMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
        return { success: true };
      } catch (injectionError) {
        console.warn("[RavenEye] In-page script injection restricted; launching PDF/document capture:", injectionError);
        return await startFallbackCapture(tab);
      }
    }
  } catch (error) {
    console.error("[RavenEye] Activation failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to start capture.")
    };
  }
}

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    if (typeof Tesseract === "undefined" || typeof Tesseract.createWorker !== "function") {
      return Promise.reject(new Error("The bundled offline OCR engine was not loaded."));
    }

    const workerOptions = {
      workerPath: chrome.runtime.getURL("tesseract-worker.min.js"),
      corePath: chrome.runtime.getURL("tesseract-core.wasm.js"),
      langPath: `${chrome.runtime.getURL("tessdata")}/`
    };

    const createWorker = (workerBlobURL) => Tesseract.createWorker("eng", 1, {
      ...workerOptions,
      workerBlobURL
    });

    ocrWorkerPromise = createWorker(false).catch((directWorkerError) => {
      // Firefox can reject a direct extension URL as a worker while allowing
      // a blob bootstrap that imports the same extension resource.
      return createWorker(true).catch((blobWorkerError) => {
        throw new Error(
          `Firefox OCR worker could not start. Direct worker: ${getErrorMessage(directWorkerError, "unknown error")}. ` +
          `Blob worker: ${getErrorMessage(blobWorkerError, "unknown error")}`
        );
      });
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1"
      });
      return worker;
    }).catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

async function handleOCR(dataUrl, sendResponse) {
  try {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      throw new Error("Invalid capture data.");
    }
    const worker = await getOcrWorker();
    const result = await worker.recognize(dataUrl);
    sendResponse({ success: true, text: result.data.text.trim() });
  } catch (error) {
    console.error("[RavenEye] Offline OCR error:", error);
    sendResponse({
      success: false,
      error: getErrorMessage(error, "Offline OCR failed.")
    });
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-capture") {
    activateCapture();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ACTIVATE_FROM_POPUP" || message.action === "ACTIVATE_FROM_SHORTCUT") {
    activateCapture().then(sendResponse);
    return true;
  }
  if (message.action === "FALLBACK_CAPTURE") {
    getActiveTab()
      .then((tab) => startFallbackCapture(tab))
      .then(sendResponse);
    return true;
  }
  if (message.action === "GET_PENDING_CAPTURE") {
    sendResponse({ success: true, dataUrl: latestPendingCapture?.dataUrl || null });
    return false;
  }
  if (message.action === "CLOSE_TAB") {
    if (sender.tab && typeof sender.tab.id === "number") {
      chrome.tabs.remove(sender.tab.id);
    }
    return false;
  }
  if (message.action === "CAPTURE_REGION") {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png", quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ success: true, dataUrl, region: message.region });
    });
    return true;
  }
  if (message.action === "RUN_OCR") {
    handleOCR(message.dataUrl, sendResponse);
    return true;
  }
  if (message.action === "SAVE_IMAGE") {
    chrome.downloads.download({
      url: message.dataUrl,
      filename: message.filename || `raveneye-${Date.now()}.png`,
      saveAs: false
    });
    sendResponse({ success: true });
    return false;
  }
});
