// RavenEye offline background service worker for Chromium-based browsers.

const DEFAULT_OCR_SETTINGS = {
  dimIntensity: 50,
  blurIntensity: 0,
  saveImage: false,
  autoCopy: true,
  theme: "dark"
};

let offscreenCreationPromise = null;
let latestPendingCapture = null;

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
  return (
    /^(chrome|edge|about|devtools|brave|opera|vivaldi|moz-extension|view-source):\/\//i.test(url) ||
    /^https?:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons)/i.test(url)
  );
}

function isPdfOrRestrictedDocument(tab) {
  if (!tab) return false;
  const url = (tab.url || "").toLowerCase();
  const title = (tab.title || "").toLowerCase();
  if (url.endsWith(".pdf") || url.includes(".pdf?") || url.includes(".pdf#")) return true;
  if (title.endsWith(".pdf")) return true;
  if (url.startsWith("file://") && url.endsWith(".pdf")) return true;
  if (url.startsWith("chrome-extension://") && url.includes("pdf")) return true;
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

    ensureChromiumOffscreenDocument().catch(() => {});
    return { success: true };
  } catch (error) {
    console.error("[RavenEye] Fallback capture failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to capture document view.")
    };
  }
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

  if (chrome.tabs?.executeScript) {
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
}

async function hasOffscreenDocument(path) {
  const offscreenUrl = chrome.runtime.getURL(path);
  if (chrome.runtime?.getContexts) {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl]
      });
      return contexts && contexts.length > 0;
    } catch {
      // Fallback
    }
  }

  if (chrome.offscreen?.hasDocument) {
    try {
      return await chrome.offscreen.hasDocument();
    } catch {
      // Fallback
    }
  }

  return false;
}

async function ensureChromiumOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("This browser does not support the offline OCR offscreen document.");
  }

  const alreadyExists = await hasOffscreenDocument("chromium-ocr.html");
  if (alreadyExists) return;

  if (!offscreenCreationPromise) {
    offscreenCreationPromise = chrome.offscreen.createDocument({
      url: "chromium-ocr.html",
      reasons: ["BLOBS", "DOM_PARSER"],
      justification: "Run local OCR in an isolated extension page with WebAssembly and Worker support."
    }).catch((error) => {
      const msg = error?.message || String(error);
      if (msg.includes("already exists") || msg.includes("Only a single offscreen document")) {
        return;
      }
      throw error;
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

      if (attempt >= 30) {
        reject(new Error(lastError?.message || "Chromium OCR document did not respond in time."));
        return;
      }

      setTimeout(() => {
        sendOffscreenOcr(message, attempt + 1).then(resolve, reject);
      }, 150);
    });
  });
}

async function handleChromiumOCR(dataUrl, sendResponse) {
  let settled = false;
  // Keep-alive heartbeat during OCR processing to prevent SW idle sleep
  const keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo?.(() => {});
  }, 4000);

  const timeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    clearInterval(keepAliveInterval);
    sendResponse({
      success: false,
      error: "Chromium OCR timed out. Try selecting a clearer, larger text region."
    });
  }, 45000);

  const settle = (response) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    clearInterval(keepAliveInterval);
    sendResponse(response || {
      success: false,
      error: "Chromium OCR document returned no response."
    });
  };

  try {
    await ensureChromiumOffscreenDocument();
    const requestId = `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sendOffscreenOcr({
      target: "raveneye-offscreen",
      action: "RUN_OFFSCREEN_OCR",
      requestId,
      dataUrl
    }).then(settle, (error) => settle({
      success: false,
      error: error?.message || "Chromium OCR document did not respond."
    }));
  } catch (error) {
    settle({
      success: false,
      error: getErrorMessage(error, "Could not start the Chromium offline OCR document.")
    });
  }
}

async function activateCapture() {
  try {
    const tab = await getActiveTab();
    const url = tab.url || "";
    if (isRestrictedUrl(url) && !url.startsWith("about:reader")) {
      return {
        success: false,
        error: "RavenEye cannot run on browser internal or extension store pages. Open a normal website and try again."
      };
    }

    if (isPdfOrRestrictedDocument(tab)) {
      return await startFallbackCapture(tab);
    }

    try {
      await sendTabMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
      ensureChromiumOffscreenDocument().catch(() => {});
      return { success: true };
    } catch {
      try {
        await injectCaptureAssets(tab.id);
        await new Promise((resolve) => setTimeout(resolve, 80));
        await sendTabMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
        ensureChromiumOffscreenDocument().catch(() => {});
        return { success: true };
      } catch (injectionError) {
        console.warn("[RavenEye] In-page script injection restricted; launching PDF/document capture:", injectionError);
        return await startFallbackCapture(tab);
      }
    }
  } catch (error) {
    console.error("[RavenEye] Activation failed:", error);
    return { success: false, error: getErrorMessage(error, "Failed to start capture.") };
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
    if (sender?.tab && typeof sender.tab.id === "number") {
      chrome.tabs.remove(sender.tab.id);
    }
    return false;
  }

  if (message.action === "CAPTURE_REGION") {
    chrome.tabs.captureVisibleTab(sender?.tab?.windowId, { format: "png", quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ success: true, dataUrl, region: message.region });
    });
    return true;
  }

  if (message.action === "RUN_OCR") {
    handleChromiumOCR(message.dataUrl, sendResponse);
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

