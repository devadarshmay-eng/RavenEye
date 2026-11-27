// RavenEye PDF & Standalone Capture Viewer
(function () {
  let settings = {
    dimIntensity: 50,
    blurIntensity: 0,
    saveImage: false,
    autoCopy: true,
    theme: "dark"
  };

  const captureStage = document.getElementById("capture-stage");
  const wrapper = document.getElementById("capture-image-wrapper");
  const img = document.getElementById("capture-image");
  const dropPrompt = document.getElementById("drop-prompt");
  const closeHelperBtn = document.getElementById("close-helper-btn");
  const dropPromptClose = document.getElementById("drop-prompt-close");

  let overlay, selectionBox, tip, resultPopup;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let naturalWidth = 0;
  let naturalHeight = 0;

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(settings, (s) => {
        settings = Object.assign({}, settings, s);
        document.documentElement.setAttribute("data-theme", settings.theme === "light" ? "light" : "dark");
        resolve(settings);
      });
    });
  }

  function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  async function retrieveCaptureData() {
    const captureId = getQueryParam("id");
    return new Promise((resolve) => {
      if (captureId) {
        chrome.storage.local.get([captureId], (res) => {
          if (res && res[captureId] && res[captureId].dataUrl) {
            resolve(res[captureId].dataUrl);
            return;
          }
          fallbackRetrieve();
        });
      } else {
        fallbackRetrieve();
      }

      function fallbackRetrieve() {
        chrome.storage.local.get(["latestCaptureId"], (latestRes) => {
          const latestId = latestRes?.latestCaptureId;
          if (latestId) {
            chrome.storage.local.get([latestId], (res) => {
              if (res && res[latestId] && res[latestId].dataUrl) {
                resolve(res[latestId].dataUrl);
                return;
              }
              directMessageRetrieve();
            });
          } else {
            directMessageRetrieve();
          }
        });
      }

      function directMessageRetrieve() {
        chrome.runtime.sendMessage({ action: "GET_PENDING_CAPTURE" }, (response) => {
          if (chrome.runtime.lastError || !response || !response.dataUrl) {
            resolve(null);
            return;
          }
          resolve(response.dataUrl);
        });
      }
    });
  }

  function initOverlay() {
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.id = "re-overlay";
    overlay.style.position = "absolute";
    overlay.style.inset = "0";

    const backdrop = document.createElement("div");
    backdrop.id = "re-backdrop";
    overlay.style.setProperty("--raven-dim", settings.dimIntensity / 100);
    overlay.style.setProperty("--raven-blur", settings.blurIntensity + "px");
    overlay.appendChild(backdrop);

    selectionBox = document.createElement("div");
    selectionBox.id = "re-selection";
    selectionBox.style.backgroundColor = "transparent";

    const dimLabel = document.createElement("div");
    dimLabel.id = "re-dims";
    selectionBox.appendChild(dimLabel);
    overlay.appendChild(selectionBox);

    tip = document.createElement("div");
    tip.id = "raveneye-tip";
    tip.className = "raven-ui";
    const tipText = document.createElement("span");
    tipText.textContent = "Drag to capture from PDF";
    const tipKey = document.createElement("kbd");
    tipKey.textContent = "ESC";
    const tipSuffix = document.createTextNode(" to return");
    tip.appendChild(tipText);
    tip.appendChild(document.createTextNode(" "));
    tip.appendChild(tipKey);
    tip.appendChild(tipSuffix);
    overlay.appendChild(tip);

    wrapper.appendChild(overlay);

    overlay.addEventListener("mousedown", onMouseDown);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (resultPopup && resultPopup.contains(e.target)) return;

    e.preventDefault();
    isDragging = true;

    const rect = wrapper.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    const backdrop = document.getElementById("re-backdrop");
    if (backdrop) backdrop.style.opacity = "0";

    selectionBox.style.display = "block";
    selectionBox.style.left = startX + "px";
    selectionBox.style.top = startY + "px";
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";

    if (tip) tip.style.display = "none";

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const rect = wrapper.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const box = getBoundingBox(startX, startY, currentX, currentY);

    selectionBox.style.left = box.x + "px";
    selectionBox.style.top = box.y + "px";
    selectionBox.style.width = box.width + "px";
    selectionBox.style.height = box.height + "px";

    const dimsEl = selectionBox.querySelector("#re-dims");
    if (dimsEl) {
      dimsEl.innerText = `${Math.round(box.width)} × ${Math.round(box.height)}`;
    }
  }

  async function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);

    const rect = wrapper.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const box = getBoundingBox(startX, startY, currentX, currentY);

    if (box.width < 10 || box.height < 10) {
      selectionBox.style.display = "none";
      const backdrop = document.getElementById("re-backdrop");
      if (backdrop) backdrop.style.opacity = "1";
      if (tip) tip.style.display = "flex";
      return;
    }

    // Convert wrapper-scaled coordinates to natural image coordinates
    const scaleX = naturalWidth / rect.width;
    const scaleY = naturalHeight / rect.height;

    const naturalBox = {
      x: Math.round(box.x * scaleX),
      y: Math.round(box.y * scaleY),
      width: Math.round(box.width * scaleX),
      height: Math.round(box.height * scaleY)
    };

    overlay.style.opacity = "0";

    try {
      const croppedUrl = cropImage(img, naturalBox);
      overlay.style.opacity = "1";
      selectionBox.style.display = "none";
      const backdrop = document.getElementById("re-backdrop");
      if (backdrop) backdrop.style.opacity = "1";

      if (settings.saveImage) {
        chrome.runtime.sendMessage({
          action: "SAVE_IMAGE",
          dataUrl: croppedUrl
        });
        showToast("Image saved to downloads", "success");
      }

      showResult(croppedUrl);

      // OCR Pipeline
      try {
        const ocrImage = await prepareOcrImage(croppedUrl);
        const ocrRes = await sendMessagePromise({ action: "RUN_OCR", dataUrl: ocrImage });
        const textArea = document.getElementById("raven-text-area");

        if (ocrRes && ocrRes.success && ocrRes.text) {
          if (textArea) textArea.value = ocrRes.text;
          if (settings.autoCopy) {
            copyTextToClipboard(ocrRes.text);
          }
        } else if (ocrRes && ocrRes.success) {
          if (textArea) textArea.value = "No text found in selected region.";
        } else {
          if (textArea) textArea.value = `OCR failed: ${ocrRes?.error || "Unknown OCR error."}`;
        }
      } catch (ocrErr) {
        const textArea = document.getElementById("raven-text-area");
        if (textArea) textArea.value = "OCR Failed: " + (ocrErr?.message || String(ocrErr));
      }
    } catch (err) {
      console.error("[RavenEye] Crop/OCR error:", err);
      overlay.style.opacity = "1";
      showToast("Could not process selection", "error");
    }
  }

  function getBoundingBox(x1, y1, x2, y2) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    };
  }

  function cropImage(sourceImg, rect) {
    const canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(sourceImg, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    return canvas.toDataURL("image/png");
  }

  function prepareOcrImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const tempImg = new Image();
      tempImg.onload = () => {
        const scale = Math.min(3, Math.max(2, 1600 / Math.max(tempImg.width, tempImg.height)));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(tempImg.width * scale);
        canvas.height = Math.round(tempImg.height * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.filter = "grayscale(1) contrast(1.18)";
        ctx.drawImage(tempImg, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      tempImg.onerror = () => reject(new Error("Could not prepare capture for OCR."));
      tempImg.src = dataUrl;
    });
  }

  function showResult(imgUrl) {
    if (resultPopup) resultPopup.remove();

    resultPopup = document.createElement("div");
    resultPopup.id = "raveneye-result";
    resultPopup.className = "raven-ui";

    const header = document.createElement("div");
    header.className = "raven-header";
    const title = document.createElement("span");
    title.className = "raven-title";
    title.textContent = "RavenEye OCR";
    const closeBtn = document.createElement("button");
    closeBtn.className = "raven-close";
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    header.appendChild(title);
    header.appendChild(closeBtn);

    const preview = document.createElement("div");
    preview.className = "raven-preview";
    const previewImage = document.createElement("img");
    previewImage.id = "raven-preview-image";
    previewImage.alt = "Capture preview";
    previewImage.src = imgUrl;
    preview.appendChild(previewImage);

    const content = document.createElement("div");
    content.className = "raven-content";
    const textArea = document.createElement("textarea");
    textArea.id = "raven-text-area";
    textArea.className = "raven-text-area";
    textArea.readOnly = false;
    textArea.value = "Processing text...";
    const actions = document.createElement("div");
    actions.className = "raven-actions";

    const copyTextBtn = document.createElement("button");
    copyTextBtn.id = "btn-copy-text";
    copyTextBtn.className = "raven-btn primary";
    copyTextBtn.type = "button";
    copyTextBtn.textContent = "Copy Text";

    const copyImgBtn = document.createElement("button");
    copyImgBtn.id = "btn-copy-img";
    copyImgBtn.className = "raven-btn";
    copyImgBtn.type = "button";
    copyImgBtn.textContent = "Copy Image";

    const closeResultBtn = document.createElement("button");
    closeResultBtn.id = "btn-close-viewer";
    closeResultBtn.className = "raven-btn";
    closeResultBtn.type = "button";
    closeResultBtn.textContent = "Done";

    actions.appendChild(copyTextBtn);
    actions.appendChild(copyImgBtn);
    actions.appendChild(closeResultBtn);
    content.appendChild(textArea);
    content.appendChild(actions);

    resultPopup.appendChild(header);
    resultPopup.appendChild(preview);
    resultPopup.appendChild(content);

    document.body.appendChild(resultPopup);

    let hideTimer;
    const AUTO_HIDE_DELAY = 10000; // 10 seconds for standalone viewer

    function stopHideTimer() {
      clearTimeout(hideTimer);
    }

    function startHideTimer() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (resultPopup && document.body.contains(resultPopup)) {
          resultPopup.classList.add("hiding");
          setTimeout(() => {
            if (resultPopup && document.body.contains(resultPopup)) {
              resultPopup.remove();
              resultPopup = null;
            }
          }, 300);
        }
      }, AUTO_HIDE_DELAY);
    }

    startHideTimer();

    resultPopup.addEventListener("mouseenter", stopHideTimer);
    resultPopup.addEventListener("mouseleave", startHideTimer);
    resultPopup.addEventListener("focusin", stopHideTimer);

    closeBtn.onclick = () => {
      stopHideTimer();
      resultPopup.remove();
      resultPopup = null;
    };

    copyTextBtn.onclick = () => {
      const text = document.getElementById("raven-text-area").value;
      copyTextToClipboard(text);
      startHideTimer();
    };

    copyImgBtn.onclick = async () => {
      try {
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showToast("Image copied!", "success");
        startHideTimer();
      } catch {
        showToast("Failed to copy image", "error");
      }
    };

    closeResultBtn.onclick = () => {
      closeViewer();
    };
  }

  async function copyTextToClipboard(text) {
    if (!text || text === "Processing text..." || text.startsWith("OCR failed:")) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast("Text copied!", "success");
        return;
      }
    } catch {
      // Fallback
    }

    try {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.select();
      const success = document.execCommand("copy");
      helper.remove();
      if (success) {
        showToast("Text copied!", "success");
        return;
      }
    } catch {}

    showToast("Capture ready - click Copy Text", "info");
  }

  function showToast(msg, type) {
    const existing = document.querySelector(".raven-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "raven-ui raven-toast";
    toast.textContent = `✓ ${msg}`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function sendMessagePromise(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error("No response from extension background service."));
          return;
        }
        resolve(response);
      });
    });
  }

  function closeViewer() {
    try {
      window.close();
    } catch {
      // Ignored
    }
    chrome.runtime.sendMessage({ action: "CLOSE_TAB" });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeViewer();
    }
  });

  if (closeHelperBtn) {
    closeHelperBtn.addEventListener("click", closeViewer);
  }
  if (dropPromptClose) {
    dropPromptClose.addEventListener("click", closeViewer);
  }

  // Handle Drag & Drop of local images or PDFs
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && files[0].type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        loadImage(reader.result);
      };
      reader.readAsDataURL(files[0]);
    }
  });

  // Handle Paste
  window.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            loadImage(reader.result);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  });

  function loadImage(dataUrl) {
    img.onload = () => {
      naturalWidth = img.naturalWidth || img.width;
      naturalHeight = img.naturalHeight || img.height;
      dropPrompt.style.display = "none";
      wrapper.style.display = "inline-block";
      initOverlay();
    };
    img.src = dataUrl;
  }

  // Bootstrapping
  async function start() {
    await loadSettings();
    const dataUrl = await retrieveCaptureData();
    if (dataUrl) {
      loadImage(dataUrl);
    } else {
      dropPrompt.style.display = "flex";
      wrapper.style.display = "none";
    }
  }

  start();
})();
