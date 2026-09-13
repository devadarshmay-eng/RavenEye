let workerPromise;
const requests = new Map();

function errorMessage(error) {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error.message === "string" && error.message.trim()) return error.message;
  return "Chromium offline OCR worker failed to start.";
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("eng", 1, {
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
      workerPromise = null;
      throw new Error(errorMessage(error));
    });
  }
  return workerPromise;
}

function runOcr(message, sendResponse) {
  const requestId = message.requestId || `legacy-${Date.now()}`;
  if (requests.has(requestId)) {
    requests.get(requestId).then(sendResponse);
    return true;
  }

  const resultPromise = getWorker()
    .then((worker) => worker.recognize(message.dataUrl))
    .then((result) => ({ success: true, text: result.data.text.trim() }))
    .catch((error) => ({
      success: false,
      error: `Chromium offline OCR failed: ${errorMessage(error)}`
    }));
  requests.set(requestId, resultPromise);
  resultPromise.then((response) => {
    requests.delete(requestId);
    sendResponse(response);
  });
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "raveneye-offscreen" || message.action !== "RUN_OFFSCREEN_OCR") {
    return false;
  }
  return runOcr(message, sendResponse);
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "raveneye-offscreen-ocr") return;
  port.onMessage.addListener((message) => {
    if (message.action !== "RUN_OFFSCREEN_OCR") return;
    runOcr(message, (response) => port.postMessage(response));
  });
});
