// RavenEye offline background service.

const DEFAULT_OCR_SETTINGS = {
  dimIntensity: 50,
  blurIntensity: 0,
  saveImage: false,
  autoCopy: true,
  theme: "dark"
};

let ocrWorkerPromise;

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
  if (chrome.scripting) {
    await Promise.all([
      chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }),
      chrome.scripting.insertCSS({ target: { tabId }, files: ["raven-styles.css"] })
    ]);
    return;
  }

  await new Promise((resolve, reject) => {
    chrome.tabs.executeScript(tabId, { file: "content.js" }, () => {
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
    try {
      if (typeof Tesseract === "undefined") {
        importScripts("tesseract.min.js");
      }
    } catch (error) {
      return Promise.reject(new Error(`Offline OCR engine could not start: ${error.message}`));
    }

    ocrWorkerPromise = Tesseract.createWorker("eng", 1, {
      workerPath: chrome.runtime.getURL("tesseract-worker.min.js"),
      corePath: chrome.runtime.getURL("tesseract-core.wasm.js"),
      langPath: chrome.runtime.getURL("tessdata")
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
    const text = result.data.text.trim();
    sendResponse({ success: true, text });
  } catch (error) {
    console.error("[RavenEye] Offline OCR error:", error);
    sendResponse({
      success: false,
      error: error.message || "Offline OCR failed. Try selecting a clearer, larger text region."
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
