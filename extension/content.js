// RavenEye Content Script
// Core selection, capture, and OCR logic

(function () {
  console.log('[RavenEye] Content script loading...');

  // Always clean up old UI elements from any previous injection
  ['raveneye-overlay', 'raveneye-result', 'raveneye-toast'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  let isActive = false;
  let startX, startY, currentX, currentY;
  let isDragging = false;
  let overlay, backdrop, selectionBox, dimLabel, tip, resultPopup;
  let settings = {};
  let tipHideTimeout = null;

  // Load settings
  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        dimIntensity: 50,
        blurIntensity: 0,
        saveImage: false,
        autoCopy: true,
        theme: 'dark',
        accentColor: '#7C3AED',
        tipDuration: 4,
        showCaptureDetails: false
      }, (s) => {
        settings = s;
        console.log('[RavenEye] Settings loaded:', JSON.stringify(s));
        resolve(s);
      });
    });
  }

  // Listen for activation message from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[RavenEye] Content received message:', message.action);
    if (message.action === "ACTIVATE_CAPTURE") {
      activateCapture();
      sendResponse({ success: true });
    }
  });

  console.log('[RavenEye] Content script ready, listener registered');

  async function activateCapture() {
    if (isActive) return;
    await loadSettings();
    isActive = true;
    buildOverlay();
  }

  function buildOverlay() {
    removeOverlay();

    const dimValue = settings.dimIntensity / 100;
    const blurValue = settings.blurIntensity;

    overlay = document.createElement('div');
    overlay.id = 'raveneye-overlay';
    overlay.style.setProperty('--raven-dim', dimValue);
    overlay.style.setProperty('--raven-blur', blurValue + 'px');

    backdrop = document.createElement('div');
    backdrop.id = 'raveneye-backdrop';

    selectionBox = document.createElement('div');
    selectionBox.id = 'raveneye-selection';

    ['tl', 'tr', 'bl', 'br'].forEach(pos => {
      const corner = document.createElement('div');
      corner.className = `raven-corner ${pos}`;
      selectionBox.appendChild(corner);
    });

    dimLabel = document.createElement('div');
    dimLabel.id = 'raveneye-dims';
    selectionBox.appendChild(dimLabel);

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

    overlay.style.opacity = '0';
    requestAnimationFrame(() => {
      overlay.style.transition = 'opacity 0.2s ease';
      overlay.style.opacity = '1';
    });

    // Auto-hide tip
    if (settings.tipDuration > 0) {
      tipHideTimeout = setTimeout(() => {
        if (tip) {
          tip.style.transition = 'opacity 0.5s ease';
          tip.style.opacity = '0';
        }
      }, settings.tipDuration * 1000);
    }

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
      selectionBox.style.display = 'none';
      if (tip) tip.style.opacity = '1';
      return;
    }

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
    removeOverlay(false);
    await sleep(80);

    chrome.runtime.sendMessage(
      { action: 'CAPTURE_REGION', region: rect },
      async (response) => {
        if (!response || !response.success) {
          console.error('RavenEye: capture failed', response?.error);
          showToast('Capture failed', 'error');
          deactivate();
          return;
        }

        const croppedDataUrl = await cropImage(response.dataUrl, rect);

        // Show detailed popup only if user enabled it in settings
        if (settings.showCaptureDetails) {
          showResultPopup(croppedDataUrl, rect);
        }

        // Run OCR and auto-copy
        runOCR(croppedDataUrl);

        // Deactivate capture mode
        isActive = false;
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

        // Try PNG first, fall back to JPEG with progressive quality reduction
        // to stay under the OCR.space free tier ~1MB limit
        let result = canvas.toDataURL('image/png');
        const maxSize = 900 * 1024; // 900KB to leave margin

        if (result.length > maxSize) {
          // PNG is too large, try JPEG with decreasing quality
          const qualities = [0.92, 0.8, 0.6, 0.4];
          for (const q of qualities) {
            result = canvas.toDataURL('image/jpeg', q);
            if (result.length <= maxSize) break;
          }
          console.log('[RavenEye] Compressed image to', Math.round(result.length / 1024), 'KB');
        }

        resolve(result);
      };
      img.src = dataUrl;
    });
  }

  function showResultPopup(croppedDataUrl, rect) {
    resultPopup = document.createElement('div');
    resultPopup.id = 'raveneye-result';

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

  // --- OCR via background API call ---
  async function runOCR(dataUrl) {
    // Show processing toast
    showToast('Extracting text...', 'processing');

    try {
      const result = await Promise.race([
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { action: 'RUN_OCR', dataUrl: dataUrl },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              resolve(response);
            }
          );
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OCR timed out')), 30000)
        )
      ]);

      if (result && result.success && result.text) {
        // Auto-copy text only if the setting is enabled
        if (settings.autoCopy !== false) {
          copyTextToClipboard(result.text);
          showToast('✓ Text copied to clipboard', 'success');
        } else {
          showToast('✓ Text extracted', 'success');
        }

        // Update detailed popup if shown
        const textEl = document.getElementById('raven-ocr-text');
        const label = document.querySelector('.raven-ocr-label');
        if (textEl) textEl.textContent = result.text;
        if (label) label.innerHTML = 'Extracted Text';
      } else {
        showToast('No text found in selection', 'info');

        const textEl = document.getElementById('raven-ocr-text');
        const label = document.querySelector('.raven-ocr-label');
        if (textEl) textEl.textContent = '(No text found in selection)';
        if (label) label.innerHTML = 'Extracted Text';
      }
    } catch (err) {
      console.error('RavenEye OCR error:', err);
      showToast('OCR failed', 'error');

      const textEl = document.getElementById('raven-ocr-text');
      const label = document.querySelector('.raven-ocr-label');
      if (textEl) textEl.textContent = 'OCR failed. Try a clearer selection.';
      if (label) label.innerHTML = 'Error';
    }
  }

  // --- Toast notification ---
  function showToast(message, type = 'info') {
    // Remove existing toast
    const existing = document.getElementById('raveneye-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'raveneye-toast';
    toast.className = `raveneye-toast raveneye-toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('raveneye-toast-show');
    });

    // Auto-remove after duration (longer for processing)
    const duration = type === 'processing' ? 15000 : 3000;
    setTimeout(() => {
      toast.classList.remove('raveneye-toast-show');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  function copyTextToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
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
    if (tipHideTimeout) {
      clearTimeout(tipHideTimeout);
      tipHideTimeout = null;
    }
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
