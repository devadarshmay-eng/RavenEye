// RavenEye - Background Service Worker
// Handles keyboard shortcuts and message routing

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
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "ACTIVATE_CAPTURE" }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not ready, inject it
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["content.js"]
          });
          chrome.scripting.insertCSS({
            target: { tabId: tabs[0].id },
            files: ["content.css"]
          });
          // Retry after injection
          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "ACTIVATE_CAPTURE" });
          }, 300);
        }
      });
    }
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CAPTURE_REGION") {
    handleCapture(message, sender, sendResponse);
    return true; // Keep channel open for async response
  }
  if (message.action === "SAVE_IMAGE") {
    saveImage(message.dataUrl, message.filename);
    sendResponse({ success: true });
  }
  if (message.action === "COPY_TO_CLIPBOARD") {
    // Handled by content script directly
    sendResponse({ success: true });
  }
});

async function handleCapture(message, sender, sendResponse) {
  try {
    // Capture the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: "png",
      quality: 100
    });
    sendResponse({ success: true, dataUrl, region: message.region });
  } catch (error) {
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
