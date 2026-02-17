// RavenEye Content Script
// Core selection, capture, and OCR logic

(function () {
  if (window.__ravenEyeLoaded) return;
  window.__ravenEyeLoaded = true;

  let isActive = false;
  let startX, startY, currentX, currentY;
  let isDragging = false;
  let overlay, backdrop, selectionBox, dimLabel, tip, resultPopup;
  let settings = {};

  // Load settings
  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        dimIntensity: 50,
        blurIntensity: 0,
        saveImage: false,
        theme: 'dark',
        accentColor: '#7C3AED'
      }, (s) => {
        settings = s;
        resolve(s);
      });
    });
  }

  // Listen for activation message from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "ACTIVATE_CAPTURE") {
      activateCapture();
      sendResponse({ success: true });
    }
  });

  async function activateCapture() {
    if (isActive) return;
    await loadSettings();
    isActive = true;
    buildOverlay();
  }

  function buildOverlay() {
    // Remove any existing overlay
    removeOverlay();

    const dimValue = settings.dimIntensity / 100;
    const blurValue = settings.blurIntensity;

    // Main overlay container
    overlay = document.createElement('div');
    overlay.id = 'raveneye-overlay';
    overlay.style.setProperty('--raven-dim', dimValue);
    overlay.style.setProperty('--raven-blur', blurValue + 'px');

    // Backdrop (the darkened screen)
    backdrop = document.createElement('div');
    backdrop.id = 'raveneye-backdrop';

    // Selection rectangle
    selectionBox = document.createElement('div');
    selectionBox.id = 'raveneye-selection';

    // Corner handles
    ['tl', 'tr', 'bl', 'br'].forEach(pos => {
      const corner = document.createElement('div');
      corner.className = `raven-corner ${pos}`;
      selectionBox.appendChild(corner);
    });

    // Dimension label
    dimLabel = document.createElement('div');
    dimLabel.id = 'raveneye-dims';
    selectionBox.appendChild(dimLabel);

    // Instruction tooltip
    tip = document.createElement('div');
    tip.id = 'raveneye-tip';
    tip.innerHTML = `
      <div class="raven-logo">🦅 RavenEye</div>
      <p>Drag to select a region and extract text</p>
      <p style="margin-top:6px;font-size:11px;">
        <span class="key">ESC</span> to cancel
      </p>
    `;

    overlay.appendChild(backdrop);
    overlay.appendChild(selectionBox);
    overlay.appendChild(tip);
    document.body.appendChild(overlay);

    // Animate in
    overlay.style.opacity = '0';
    requestAnimationFrame(() => {
      overlay.style.transition = 'opacity 0.2s ease';
      overlay.style.opacity = '1';
    });

    // Event listeners
    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.display = 'block';
    if (tip) tip.style.opacity = '0';
    updateSelection(e.clientX, e.clientY);
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    currentX = e.clientX;
    currentY = e.clientY;
    updateSelection(currentX, currentY);
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;

    const rect = getSelectionRect();
    if (rect.width < 10 || rect.height < 10) {
      // Too small, reset
      selectionBox.style.display = 'none';
      if (tip) tip.style.opacity = '1';
      return;
    }

    // Capture!
    captureRegion(rect);
  }

  function updateSelection(x, y) {
    const rect = getSelectionRect(x, y);
    selectionBox.style.left = rect.x + 'px';
    selectionBox.style.top = rect.y + 'px';
    selectionBox.style.width = rect.width + 'px';
    selectionBox.style.height = rect.height + 'px';
    selectionBox.style.display = 'block';
    dimLabel.textContent = `${rect.width} × ${rect.height}`;
  }

  function getSelectionRect(ex = currentX, ey = currentY) {
    const x = Math.min(startX, ex);
    const y = Math.min(startY, ey);
    const width = Math.abs(ex - startX);
    const height = Math.abs(ey - startY);
    return { x, y, width, height };
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      deactivate();
    }
  }

  async function captureRegion(rect) {
    // Remove overlay before screenshot
    removeOverlay(false);

    // Small delay to let overlay disappear
    await sleep(80);

    chrome.runtime.sendMessage(
      { action: 'CAPTURE_REGION', region: rect },
      async (response) => {
        if (!response || !response.success) {
          console.error('RavenEye: capture failed', response?.error);
          return;
        }

        // Crop the full screenshot to selected region
        const croppedDataUrl = await cropImage(response.dataUrl, rect);

        // Show result popup
        showResultPopup(croppedDataUrl, rect);

        // Run OCR
        runOCR(croppedDataUrl);
      }
    );
  }

  function cropImage(dataUrl, rect) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(
          img,
          rect.x * dpr, rect.y * dpr,
          rect.width * dpr, rect.height * dpr,
          0, 0,
          canvas.width, canvas.height
        );
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  }

  function showResultPopup(croppedDataUrl, rect) {
    resultPopup = document.createElement('div');
    resultPopup.id = 'raveneye-result';

    // Position popup near selection but within viewport
    let popX = rect.x + rect.width + 12;
    let popY = rect.y;
    if (popX + 370 > window.innerWidth) popX = rect.x - 372;
    if (popX < 8) popX = 8;
    if (popY + 320 > window.innerHeight) popY = window.innerHeight - 330;
    if (popY < 8) popY = 8;

    resultPopup.style.left = popX + 'px';
    resultPopup.style.top = popY + 'px';

    resultPopup.innerHTML = `
      <div class="raven-result-header">
        <span class="raven-result-title">🦅 RavenEye — Captured</span>
        <button class="raven-close" id="raven-close-btn">✕</button>
      </div>
      <div class="raven-preview">
        <img src="${croppedDataUrl}" id="raven-preview-img" alt="Captured region" />
      </div>
      <div class="raven-ocr-area">
        <div class="raven-ocr-label">
          <span class="raven-spinner"></span>Extracting text...
        </div>
        <div class="raven-ocr-text" id="raven-ocr-text"></div>
      </div>
      <div class="raven-actions">
        <button class="raven-btn raven-btn-primary" id="raven-copy-btn">Copy Text</button>
        ${settings.saveImage ? `<button class="raven-btn raven-btn-secondary" id="raven-save-btn">Save Image</button>` : ''}
        <button class="raven-btn raven-btn-secondary" id="raven-copyimg-btn">Copy Image</button>
      </div>
    `;

    document.body.appendChild(resultPopup);

    // Bind actions
    document.getElementById('raven-close-btn').onclick = () => {
      resultPopup.remove();
      resultPopup = null;
    };

    document.getElementById('raven-copy-btn').onclick = () => {
      const text = document.getElementById('raven-ocr-text').textContent;
      copyTextToClipboard(text);
      flashSuccess('raven-copy-btn', 'Copied!');
    };

    document.getElementById('raven-copyimg-btn').onclick = () => {
      copyImageToClipboard(croppedDataUrl);
      flashSuccess('raven-copyimg-btn', 'Copied!');
    };

    if (settings.saveImage) {
      document.getElementById('raven-save-btn').onclick = () => {
        chrome.runtime.sendMessage({
          action: 'SAVE_IMAGE',
          dataUrl: croppedDataUrl,
          filename: `raveneye-${Date.now()}.png`
        });
        flashSuccess('raven-save-btn', 'Saved!');
      };
    }
  }

  async function runOCR(dataUrl) {
    try {
      // Use Tesseract.js loaded via CDN
      if (typeof Tesseract === 'undefined') {
        await loadTesseract();
      }

      const result = await Tesseract.recognize(dataUrl, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            const pct = Math.round(m.progress * 100);
            const label = document.querySelector('.raven-ocr-label');
            if (label) label.innerHTML = `<span class="raven-spinner"></span>Recognizing... ${pct}%`;
          }
        }
      });

      const text = result.data.text.trim();
      const textEl = document.getElementById('raven-ocr-text');
      const label = document.querySelector('.raven-ocr-label');

      if (textEl) textEl.textContent = text || '(No text found in selection)';
      if (label) label.innerHTML = 'Extracted Text';

      // Auto-copy text if found
      if (text) {
        copyTextToClipboard(text);
      }

    } catch (err) {
      console.error('RavenEye OCR error:', err);
      const textEl = document.getElementById('raven-ocr-text');
      const label = document.querySelector('.raven-ocr-label');
      if (textEl) textEl.textContent = 'OCR failed. Try a clearer selection.';
      if (label) label.innerHTML = 'Error';
    }
  }

  function loadTesseract() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function copyTextToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
  }

  async function copyImageToClipboard(dataUrl) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
    } catch (e) {
      console.error('RavenEye: image clipboard failed', e);
    }
  }

  function flashSuccess(btnId, text) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '✓ ' + text;
    btn.classList.add('raven-btn-success');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('raven-btn-success');
    }, 2000);
  }

  function removeOverlay(full = true) {
    if (overlay) {
      overlay.removeEventListener('mousedown', onMouseDown);
      overlay.removeEventListener('mousemove', onMouseMove);
      overlay.removeEventListener('mouseup', onMouseUp);
      overlay.remove();
      overlay = null;
    }
    document.removeEventListener('keydown', onKeyDown);
    if (full) isActive = false;
  }

  function deactivate() {
    removeOverlay(true);
    isActive = false;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

})();
