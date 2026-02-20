// RavenEye - Background Service Worker
console.log('[RavenEye] Background Worker Loaded - v2 (Fix Target)');

chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-capture") {
    activateCapture();
  }
});

function activateCapture() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      console.warn('[RavenEye] No active tab found');
      return;
    }
    const url = tabs[0].url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') || url.startsWith('about:') ||
      url.startsWith('devtools://') || url === '') {
      console.warn('[RavenEye] Cannot activate on restricted page:', url);
      return;
    }
    console.log('[RavenEye] Activating capture on tab:', tabs[0].id, url);

    chrome.tabs.sendMessage(tabs[0].id, { action: "ACTIVATE_CAPTURE" }, (response) => {
      // Check for last error (content script not ready)
      if (chrome.runtime.lastError) {
        console.log('[RavenEye] Injecting content script...', chrome.runtime.lastError.message);

        // Inject Script + CSS
        Promise.all([
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["content.js"]
          }),
          chrome.scripting.insertCSS({
            target: { tabId: tabs[0].id },
            files: ["raven-styles.css"]
          })
        ]).then(() => {
          console.log('[RavenEye] Injection success. Retrying activation...');
          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "ACTIVATE_CAPTURE" });
          }, 500);
        }).catch(err => {
          console.error('[RavenEye] Injection failed:', err);
        });
      } else {
        console.log('[RavenEye] Content script already active.');
      }
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ACTIVATE_FROM_POPUP") {
    activateCapture();
    sendResponse({ success: true });
    return; // synchronous response
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
    const formData = new FormData();
    formData.append('apikey', 'K87912588588957');
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
