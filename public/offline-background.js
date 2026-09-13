// RavenEye offline background service.

const DEFAULT_OCR_SETTINGS = {
  dimIntensity: 50,
  blurIntensity: 0,
  saveImage: false,
  autoCopy: true,
  theme: "dark"
};

let ocrWorkerPromise;
let offscreenCreationPromise;

function getErrorMessage(error, fallback) {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Use the fallback for values that cannot be serialized.
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

function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome|edge|about|devtools|moz-extension):\/\//.test(url);
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
  const contentScripts = ["content.js"];
  if (chrome.scripting) {
    await Promise.all([
      chrome.scripting.executeScript({ target: { tabId }, files: contentScripts }),
      chrome.scripting.insertCSS({ target: { tabId }, files: ["raven-styles.css"] })
    ]);
    return;
  }

  await new Promise((resolve, reject) => {
    chrome.tabs.executeScript(tabId, { file: contentScripts[contentScripts.length - 1] }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      chrome.tabs.insertCSS(tabId, { file: "raven-styles.css" }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  });
}

async function activateCapture() {
  try {
    const tab = await getActiveTab();
    if (isRestrictedUrl(tab.url || "")) {
      return {
        success: false,
        error: "RavenEye cannot run on browser internal pages. Open a normal website and try again."
      };
    }

    try {
      await sendTabMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
    } catch {
      await injectCaptureAssets(tab.id);
      await new Promise((resolve) => setTimeout(resolve, 120));
      await sendTabMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
    }
    return { success: true };
  } catch (error) {
    console.error("[RavenEye] Activation failed:", error);
    return { success: false, error: error.message || "Failed to start capture." };
  }
}

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    if (typeof Tesseract === "undefined" || typeof Tesseract.createWorker !== "function") {
      return Promise.reject(new Error("The bundled offline OCR engine was not loaded."));
    }

    ocrWorkerPromise = Tesseract.createWorker("eng", 1, {
      workerPath: chrome.runtime.getURL("tesseract-worker.min.js"),
      corePath: chrome.runtime.getURL("tesseract-core.wasm.js"),
      langPath: chrome.runtime.getURL("tessdata"),
      workerBlobURL: false
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1"
      });
      return worker;
    }).catch((error) => {
      ocrWorkerPromise = null;
      throw new Error(`Offline OCR worker could not start: ${getErrorMessage(error, "worker initialization failed")}`);
    });
  }
  return ocrWorkerPromise;
}

async function ensureChromiumOffscreenDocument() {
  if (!chrome.offscreen || !chrome.runtime.getContexts) {
    throw new Error("This Chromium browser does not support the offline OCR document.");
  }

  const offscreenUrl = chrome.runtime.getURL("chromium-ocr.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });
  if (contexts.length > 0) return;

  if (!offscreenCreationPromise) {
    offscreenCreationPromise = chrome.offscreen.createDocument({
      url: "chromium-ocr.html",
      reasons: ["WORKERS"],
      justification: "Run local OCR in a document context that supports Web Workers."
    }).finally(() => {
      offscreenCreationPromise = null;
    });
  }
  await offscreenCreationPromise;
}

function sendOffscreenOcr(message, attempt = 0) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (!lastError && response) {
        resolve(response);
        return;
      }

      if (attempt >= 20) {
        reject(new Error(lastError?.message || "Chromium OCR document did not respond."));
        return;
      }

      setTimeout(() => {
        sendOffscreenOcr(message, attempt + 1).then(resolve, reject);
      }, 250);
    });
  });
}

async function handleChromiumOCR(dataUrl, sendResponse) {
  try {
    await ensureChromiumOffscreenDocument();
    let settled = false;
    const requestId = `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const settle = (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      sendResponse(response || {
        success: false,
        error: "Chromium OCR document returned no response."
      });
    };
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      sendResponse({
        success: false,
        error: "Chromium OCR timed out. Try selecting a larger or clearer text region."
      });
    }, 60000);

    sendOffscreenOcr({
      target: "raveneye-offscreen",
      action: "RUN_OFFSCREEN_OCR",
      requestId,
      dataUrl
    }).then(settle, (error) => settle({
      success: false,
      error: error.message || "Chromium OCR document did not respond."
    }));
  } catch (error) {
    sendResponse({
      success: false,
      error: getErrorMessage(error, "Could not start the Chromium offline OCR document.")
    });
  }
}

async function handleOCR(dataUrl, sendResponse) {
  try {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      throw new Error("Invalid capture data.");
    }
    const worker = await getOcrWorker();
    const result = await worker.recognize(dataUrl);
    const text = result.data.text.trim();
    sendResponse({ success: true, text });
  } catch (error) {
    console.error("[RavenEye] Offline OCR error:", error);
    sendResponse({
      success: false,
      error: getErrorMessage(error, "Offline OCR failed. Try selecting a clearer, larger text region.")
    });
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-capture") activateCapture();
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
    if (chrome.offscreen?.createDocument && chrome.runtime.getContexts) {
      handleChromiumOCR(message.dataUrl, sendResponse);
      return true;
    }
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
