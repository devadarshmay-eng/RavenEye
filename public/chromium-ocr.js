let workerPromise;

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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "raveneye-offscreen-ocr") return;

  port.onMessage.addListener((message) => {
    if (message.action !== "RUN_OFFSCREEN_OCR") return;

    getWorker()
      .then((worker) => worker.recognize(message.dataUrl))
      .then((result) => port.postMessage({ success: true, text: result.data.text.trim() }))
      .catch((error) => port.postMessage({
        success: false,
        error: `Chromium offline OCR failed: ${errorMessage(error)}`
      }));
  });
});
