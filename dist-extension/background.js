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

async function handleOCR(dataUrl, sendResponse) {
  try {
    // Retrieve API key from storage
    const settings = await chrome.storage.sync.get({ ocrApiKey: '' });
    const apiKey = settings.ocrApiKey.trim();

    if (!apiKey) {
      sendResponse({ 
        success: false, 
        error: 'API key not configured. Please add your OCR.space API key in the extension settings. Get a free key at https://ocr.space/ocrapi' 
      });
      return;
    }

    const formData = new FormData();
    formData.append('apikey', apiKey);
    formData.append('base64Image', dataUrl);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');
    formData.append('filetype', dataUrl.startsWith('data:image/jpeg') ? 'JPG' : 'PNG');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.OCRExitCode === 1 && result.ParsedResults?.length > 0) {
      sendResponse({ success: true, text: result.ParsedResults[0].ParsedText.trim() });
    } else if (result.OCRExitCode === 99) {
      // Invalid API key
      sendResponse({ 
        success: false, 
        error: 'Invalid API key. Please check your OCR.space API key in settings.' 
      });
    } else {
      sendResponse({ success: true, text: '' }); // No text found
    }
  } catch (error) {
    console.error('[RavenEye] OCR Error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function saveImage(dataUrl, filename) {
  chrome.downloads.download({
    url: dataUrl,
    filename: filename || `raveneye-${Date.now()}.png`,
    saveAs: false
  });
}
