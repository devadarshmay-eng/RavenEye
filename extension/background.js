// RavenEye - Background Service Worker
// Handles keyboard shortcuts, screen capture, and OCR via free API

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
      if (chrome.runtime.lastError) {
        console.log('[RavenEye] Content script not ready, injecting...', chrome.runtime.lastError.message);
        // Inject content script and CSS
        Promise.all([
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["content.js"]
          }),
          chrome.scripting.insertCSS({
            target: { tabId: tabs[0].id },
            files: ["content.css"]
          })
        ]).then(() => {
          console.log('[RavenEye] Injection complete, sending activate message...');
          // Wait for content script to initialize
          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "ACTIVATE_CAPTURE" }, (resp) => {
              if (chrome.runtime.lastError) {
                console.error('[RavenEye] Failed to activate after injection:', chrome.runtime.lastError.message);
              } else {
                console.log('[RavenEye] Activated successfully after injection');
              }
            });
          }, 500);
        }).catch(err => {
          console.error('[RavenEye] Script injection failed:', err);
        });
      } else {
        console.log('[RavenEye] Activated successfully (content script was ready)');
      }
    });
  });
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ACTIVATE_FROM_POPUP") {
    activateCapture();
    sendResponse({ success: true });
    return;
  }
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
    // Check data URL size — OCR.space free tier limit is ~1MB
    const sizeInBytes = dataUrl.length * 0.75; // approximate decoded size
    console.log('[RavenEye] Image size:', Math.round(sizeInBytes / 1024), 'KB');

    if (sizeInBytes > 1024 * 1024) {
      console.warn('[RavenEye] Image too large for free API, will attempt anyway');
    }

    // Build form data for OCR.space API
    const formData = new FormData();
    formData.append('apikey', 'K87912588588957');
    formData.append('base64Image', dataUrl);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');
    // Detect filetype from data URL
    const filetype = dataUrl.startsWith('data:image/jpeg') ? 'JPG' : 'PNG';
    formData.append('filetype', filetype);

    console.log('[RavenEye] Sending OCR request...');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      console.error('[RavenEye] API HTTP error:', response.status, response.statusText);
      sendResponse({ success: false, error: `API error: ${response.status} ${response.statusText}` });
      return;
    }

    const result = await response.json();
    console.log('[RavenEye] OCR response:', JSON.stringify(result).substring(0, 500));

    if (result.OCRExitCode === 1 && result.ParsedResults && result.ParsedResults.length > 0) {
      const text = result.ParsedResults[0].ParsedText.trim();
      sendResponse({ success: true, text: text || '' });
    } else if (result.IsErroredOnProcessing) {
      const errMsg = Array.isArray(result.ErrorMessage)
        ? result.ErrorMessage.join('; ')
        : (result.ErrorMessage || 'OCR processing error');
      console.error('[RavenEye] OCR processing error:', errMsg);
      sendResponse({ success: false, error: errMsg });
    } else {
      console.log('[RavenEye] No text found, exit code:', result.OCRExitCode);
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
