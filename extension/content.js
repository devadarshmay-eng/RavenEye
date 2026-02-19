// RavenEye Content Script
(function () {
  // SVG Icons for professional look
  const ICONS = {
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
  };

  // Clean up old elements
  ['raveneye-overlay', 'raveneye-result', 'raveneye-toast'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  let isActive = false;
  let startX, startY;
  let isDragging = false;
  let overlay, selectionBox, dimLabel, tip, resultPopup;
  let settings = {};

  // Load settings
  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        dimIntensity: 50,
        blurIntensity: 0,
        saveImage: false,
        autoCopy: true,
        theme: 'dark'
      }, (s) => {
        settings = s;
        resolve(s);
      });
    });
  }

  // Listen for activation
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[RavenEye] Message received:', message);
    if (message.action === "ACTIVATE_CAPTURE") {
      activateCapture()
        .then(() => sendResponse({ success: true }))
        .catch(err => {
          console.error('[RavenEye] Activation failed:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true; // Keep channel open for async response
    }
  });

  async function activateCapture() {
    console.log('[RavenEye] Activating capture...');
    if (isActive) {
      console.log('[RavenEye] Already active');
      return;
    }
    await loadSettings();
    isActive = true;
    buildOverlay();
    console.log('[RavenEye] Overlay built');
  }

  function buildOverlay() {
    isActive = true;

    // Create Overlay
    overlay = document.createElement('div');
    overlay.id = 'raveneye-overlay';

    // Apply Theme Class
    if (settings.theme === 'light') {
      overlay.classList.add('raven-light-theme');
    }

    // Set dynamic styles
    overlay.style.setProperty('--raven-dim', settings.dimIntensity / 100);
    overlay.style.setProperty('--raven-blur', settings.blurIntensity + 'px');

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'raveneye-backdrop';
    overlay.appendChild(backdrop);

    // Selection Box
    selectionBox = document.createElement('div');
    selectionBox.id = 'raveneye-selection';

    // Corners
    ['tl', 'tr', 'bl', 'br'].forEach(pos => {
      const corner = document.createElement('div');
      corner.className = `raven-corner ${pos}`;
      selectionBox.appendChild(corner);
    });

    dimLabel = document.createElement('div');
    dimLabel.id = 'raveneye-dims';
    selectionBox.appendChild(dimLabel);
    overlay.appendChild(selectionBox);

    // Tip (Professional Pill)
    tip = document.createElement('div');
    tip.id = 'raveneye-tip';
    tip.innerHTML = `
      <span>Draw a box to capture text</span>
      <span class="key-hint">ESC to cancel</span>
    `;
    overlay.appendChild(tip);
    document.body.appendChild(overlay);

    // Event Listeners
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

    // Hide tip when drawing starts
    if (tip) tip.style.opacity = '0';

    updateSelection(e.clientX, e.clientY);
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    updateSelection(e.clientX, e.clientY);
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;

    const rect = getSelectionRect(e.clientX, e.clientY);
    if (rect.width < 10 || rect.height < 10) {
      selectionBox.style.display = 'none';
      if (tip) tip.style.opacity = '1'; // Show tip again if selection invalid
      return;
    }

    captureRegion(rect);
  }

  function updateSelection(ex, ey) {
    const rect = getSelectionRect(ex, ey);
    selectionBox.style.left = rect.x + 'px';
    selectionBox.style.top = rect.y + 'px';
    selectionBox.style.width = rect.width + 'px';
    selectionBox.style.height = rect.height + 'px';

    if (dimLabel) dimLabel.textContent = `${rect.width} × ${rect.height}`;
    selectionBox.classList.add('active');
  }

  function getSelectionRect(ex, ey) {
    const x = Math.min(startX, ex);
    const y = Math.min(startY, ey);
    return {
      x, y,
      width: Math.abs(ex - startX),
      height: Math.abs(ey - startY)
    };
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') deactivate();
  }

  function deactivate() {
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
    isActive = false;
  }

  async function captureRegion(rect) {
    deactivate(); // Clear overlay immediately

    chrome.runtime.sendMessage({ action: 'CAPTURE_REGION', region: rect }, async (response) => {
      if (response && response.success) {
        // Crop image locally to avoid sending full screenshot if possible
        const croppedUrl = await cropImage(response.dataUrl, rect);
        showResultPopup(croppedUrl, rect);
        runOCR(croppedUrl);
      } else {
        showToast('Capture failed', 'error');
      }
    });
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
        ctx.drawImage(img, rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  }

  function showResultPopup(dataUrl, rect) {
    resultPopup = document.createElement('div');
    resultPopup.id = 'raveneye-result';

    if (settings.theme === 'light') resultPopup.classList.add('raven-light-theme');

    // FIXED POSITION: Top-Right (handled by CSS now)
    // Removed dynamic calculation logic

    resultPopup.innerHTML = `
      <div class="raven-header">
        <div class="raven-title">RavenEye</div>
        <button id="raven-close" class="raven-close">${ICONS.close}</button>
      </div>
      <div class="raven-preview">
        <img src="${dataUrl}">
      </div>
      <div class="raven-content">
        <div class="raven-status-row">
          <div class="raven-loader"></div>
          <span id="raven-status-text">Processing...</span>
        </div>
        <div class="raven-textarea" id="raven-text" contenteditable="true"></div>
        <div class="raven-actions">
          <button id="raven-copy" class="raven-btn raven-btn-primary">Copy Text</button>
          <button id="raven-copy-img" class="raven-btn">Copy Image</button>
        </div>
      </div>
    `;

    document.body.appendChild(resultPopup);

    // --- Auto-Hide Logic ---
    let hideTimer;
    const AUTO_HIDE_DELAY = 4000; // 4 seconds

    function startHideTimer() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (resultPopup) {
          resultPopup.classList.add('hiding');
          setTimeout(() => {
            if (resultPopup) resultPopup.remove();
            resultPopup = null;
          }, 300); // Wait for transition
        }
      }, AUTO_HIDE_DELAY);
    }

    // Start timer initially
    startHideTimer();

    // Pause on hover / Interaction
    resultPopup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    resultPopup.addEventListener('mouseleave', startHideTimer);

    // Also reset on any click inside (just in case)
    resultPopup.addEventListener('click', () => {
      clearTimeout(hideTimer);
      // Optional: restart timer or keep open? 
      // Requirement: "until user make a selection... popup disappear in 3-4s"
      // Assuming hover logic covers "making selection". 
      // But if they click "Copy", maybe we want to keep it open or close it?
      // Let's keep it open while interacting.
    });

    // Event Bindings
    document.getElementById('raven-close').onclick = () => {
      clearTimeout(hideTimer);
      resultPopup.remove();
      resultPopup = null;
    };

    document.getElementById('raven-copy').onclick = () => {
      const text = document.getElementById('raven-text').innerText;
      navigator.clipboard.writeText(text);
      showToast('Copied to clipboard', 'success');
      // Keep open after copy? User might want to copy image too.
      // Timer is paused because mouse is inside.
    };

    document.getElementById('raven-copy-img').onclick = async () => {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        showToast('Image copied', 'success');
      } catch (e) {
        showToast('Failed to copy image', 'error');
      }
    };
  }

  async function runOCR(dataUrl) {
    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'RUN_OCR', dataUrl }, resolve);
      });

      const loader = document.querySelector('.raven-loader');
      const statusText = document.getElementById('raven-status-text');
      const textArea = document.getElementById('raven-text');

      if (loader) loader.style.display = 'none';

      if (response && response.success) {
        if (settings.autoCopy) navigator.clipboard.writeText(response.text);

        if (statusText) {
          statusText.textContent = "Extracted";
          statusText.style.color = "var(--raven-success)";
        }
        if (textArea) textArea.innerText = response.text;
      } else {
        if (statusText) {
          statusText.textContent = "Failed";
          statusText.style.color = "var(--raven-error)";
        }
        if (textArea) textArea.innerText = "No text found or error occurred.";
      }
    } catch (e) {
      console.error(e);
      showToast('OCR Error', 'error');
    }
  }

  function showToast(msg, type = 'success') {
    const existing = document.getElementById('raveneye-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `raven-toast ${type} ${settings.theme === 'light' ? 'raven-light-theme' : ''}`;
    toast.id = 'raveneye-toast';
    toast.innerHTML = type === 'success' ? `${ICONS.check} ${msg}` : msg;

    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

})();
