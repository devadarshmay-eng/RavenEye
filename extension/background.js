// RavenEye - Background Service Worker
// Handles keyboard shortcuts, screen capture, and OCR via free API

chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-capture") {
    activateCapture();
  }
});

chrome.action.onClicked.addListener((tab) => {
  activateCapture();
});

function activateCapture() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const url = tabs[0].url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') || url.startsWith('about:') ||
      url.startsWith('devtools://') || url === '') {
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { action: "ACTIVATE_CAPTURE" }, (response) => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ["content.js"]
        }).catch(() => { });
        chrome.scripting.insertCSS({
          target: { tabId: tabs[0].id },
          files: ["content.css"]
        }).catch(() => { });
        setTimeout(() => {
          chrome.tabs.sendMessage(tabs[0].id, { action: "ACTIVATE_CAPTURE" });
        }, 300);
      }
    });
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CAPTURE_REGION") {
    handleCapture(message, sender, sendResponse);
    return true;
  }
  if (message.action === "RUN_OCR") {
    handleOCR(message.dataUrl, sendResponse);
    return true;
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

// ---- OCR via OCR.space free API ----
async function handleOCR(dataUrl, sendResponse) {
  try {
    // Build form data for OCR.space API
    const formData = new FormData();
    formData.append('apikey', 'K87912588588957');
    formData.append('base64Image', dataUrl);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      sendResponse({ success: false, error: `API error: ${response.status}` });
      return;
    }

    const result = await response.json();

    if (result.OCRExitCode === 1 && result.ParsedResults && result.ParsedResults.length > 0) {
      const text = result.ParsedResults[0].ParsedText.trim();
      sendResponse({ success: true, text: text || '' });
    } else if (result.IsErroredOnProcessing) {
      sendResponse({ success: false, error: result.ErrorMessage || 'OCR processing error' });
    } else {
      sendResponse({ success: true, text: '' });
    }
  } catch (error) {
    console.error('[RavenEye] OCR failed:', error);
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
