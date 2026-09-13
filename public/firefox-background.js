// RavenEye Firefox background page.

let ocrWorkerPromise;

function getErrorMessage(error, fallback) {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
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

async function activateCapture() {
  try {
    const tab = await getActiveTab();
    const url = tab.url || "";
    if (/^(chrome|edge|about|devtools|moz-extension):\/\//.test(url)) {
      return {
        success: false,
        error: "RavenEye cannot run on browser internal pages."
      };
    }

    try {
      await sendTabMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
    } catch {
      await chrome.tabs.executeScript(tab.id, { file: "content.js" });
      await chrome.tabs.insertCSS(tab.id, { file: "raven-styles.css" });
      await new Promise((resolve) => setTimeout(resolve, 120));
      await sendTabMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
    }
    return { success: true };
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
      return createWorker(true).catch(() => {
        throw directWorkerError;
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
  }
});
