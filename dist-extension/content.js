// RavenEye Content Script - Shadcn Edition
(function () {
  let overlay, selectionBox, tip, resultPopup;
  let isActive = false;
  let isDragging = false;
  let startX, startY;
  let settings = {};

  // Clean initialization
  function init() {
    ['re-overlay', 'raveneye-overlay', 'raveneye-result'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  // Settings Loader
  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        dimIntensity: 50,
        blurIntensity: 0,
        saveImage: false,
        autoCopy: true,
        theme: 'dark',
        ocrRelayUrl: ''
      }, (s) => {
        settings = s;
        resolve(s);
      });
    });
  }

  // Global Message Listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "ACTIVATE_CAPTURE") {
      activateCapture();
      sendResponse({ success: true });
    }
  });

  async function activateCapture() {
    if (isActive) return;
    init();
    await loadSettings();

    isActive = true;

    // Create Overlay
    overlay = document.createElement('div');
    overlay.id = 're-overlay'; // New ID

    const backdrop = document.createElement('div');
    backdrop.id = 're-backdrop'; // New ID

    // Set vars on parent overlay so siblings (selectionBox) can use them
    overlay.style.setProperty('--raven-dim', settings.dimIntensity / 100);
    overlay.style.setProperty('--raven-blur', settings.blurIntensity + 'px');

    overlay.appendChild(backdrop);

    selectionBox = document.createElement('div');
    selectionBox.id = 're-selection'; // New ID
    selectionBox.style.backgroundColor = 'transparent'; // Inline enforcement

    const dimLabel = document.createElement('div');
    dimLabel.id = 're-dims'; // New ID
    selectionBox.appendChild(dimLabel);

    overlay.appendChild(selectionBox);

    tip = document.createElement('div');
    tip.id = 'raveneye-tip';
    tip.className = 'raven-ui';
    const tipText = document.createElement('span');
    tipText.textContent = 'Drag to capture';
    const tipKey = document.createElement('kbd');
    tipKey.textContent = 'ESC';
    const tipSuffix = document.createTextNode(' to cancel');
    tip.appendChild(tipText);
    tip.appendChild(document.createTextNode(' '));
    tip.appendChild(tipKey);
    tip.appendChild(tipSuffix);
    overlay.appendChild(tip);

    document.body.appendChild(overlay);

    // Event Listeners
    overlay.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    // Switch to selection mode: Hide global backdrop, Show selection box (which has its own shadow)
    const backdrop = document.getElementById('re-backdrop');
    if (backdrop) backdrop.style.opacity = '0';

    selectionBox.style.display = 'block';

    // Hide tip
    if (tip) tip.style.display = 'none';

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const rect = getRect(e.clientX, e.clientY);

    selectionBox.style.left = rect.x + 'px';
    selectionBox.style.top = rect.y + 'px';
    selectionBox.style.width = rect.width + 'px';
    selectionBox.style.height = rect.height + 'px';

    selectionBox.querySelector('#re-dims').innerText = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  }

  async function onMouseUp(e) {
    isDragging = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);

    const rect = getRect(e.clientX, e.clientY);

    // If selection is too small, cancel/reset
    if (rect.width < 10 || rect.height < 10) {
      selectionBox.style.display = 'none';
      const backdrop = document.getElementById('re-backdrop');
      if (backdrop) backdrop.style.opacity = '1';
      if (tip) tip.style.display = 'flex';
      return;
    }

    // Capture
    overlay.style.opacity = '0'; // Hide overlay slightly before capture
    setTimeout(async () => {
      try {
        const response = await sendMessagePromise({ action: 'CAPTURE_REGION', region: rect });
        deactivate();

        if (response.success) {
          // Crop
          const croppedUrl = await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const dpr = window.devicePixelRatio || 1;
              canvas.width = rect.width * dpr;
              canvas.height = rect.height * dpr;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL());
            };
            img.src = response.dataUrl;
          });

          // Auto Save Check
          if (settings.saveImage) {
            chrome.runtime.sendMessage({
              action: 'SAVE_IMAGE',
              dataUrl: croppedUrl
            });
            showToast('Image saved', 'success');
          }

          showResult(croppedUrl);

          // OCR
          try {
            const ocrRes = await sendMessagePromise({ action: 'RUN_OCR', dataUrl: croppedUrl });
            const textArea = document.getElementById('raven-text-area');

            if (ocrRes.success && ocrRes.text) {
              if (textArea) textArea.value = ocrRes.text;
              if (settings.autoCopy) {
                navigator.clipboard.writeText(ocrRes.text);
                showToast('Text copied!', 'success');
              }
            } else if (ocrRes.success) {
              if (textArea) textArea.value = "No text found.";
            } else {
              if (textArea) textArea.value = `OCR failed: ${ocrRes.error || 'Unknown OCR error.'}`;
            }
          } catch (e) {
            const textArea = document.getElementById('raven-text-area');
            if (textArea) textArea.value = "OCR Failed: " + e.message;
          }
        } else {
          showToast('Capture failed', 'error');
        }
      } catch (err) {
        console.error(err);
        deactivate();
      }
    }, 50);
  }

  function getRect(ex, ey) {
    const x = Math.min(startX, ex);
    const y = Math.min(startY, ey);
    return {
      x, y,
      width: Math.abs(ex - startX),
      height: Math.abs(ey - startY)
    };
  }

  function deactivate() {
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
    isActive = false;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') deactivate();
  }

  function sendMessagePromise(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('No response from extension background service.'));
          return;
        }
        resolve(response);
      });
    });
  }

  function showResult(imgUrl) {
    if (resultPopup) resultPopup.remove();

    resultPopup = document.createElement('div');
    resultPopup.id = 'raveneye-result';
    resultPopup.className = 'raven-ui';

    const header = document.createElement('div');
    header.className = 'raven-header';
    const title = document.createElement('span');
    title.className = 'raven-title';
    title.textContent = 'RavenEye';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'raven-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    header.appendChild(title);
    header.appendChild(closeBtn);

    const preview = document.createElement('div');
    preview.className = 'raven-preview';
    const previewImage = document.createElement('img');
    previewImage.id = 'raven-preview-image';
    previewImage.alt = 'Capture preview';
    preview.appendChild(previewImage);

    const content = document.createElement('div');
    content.className = 'raven-content';
    const textArea = document.createElement('textarea');
    textArea.id = 'raven-text-area';
    textArea.className = 'raven-text-area';
    textArea.readOnly = true;
    textArea.value = 'Processing text...';
    const actions = document.createElement('div');
    actions.className = 'raven-actions';
    const copyTextBtn = document.createElement('button');
    copyTextBtn.id = 'btn-copy-text';
    copyTextBtn.className = 'raven-btn primary';
    copyTextBtn.type = 'button';
    copyTextBtn.textContent = 'Copy Text';
    const copyImgBtn = document.createElement('button');
    copyImgBtn.id = 'btn-copy-img';
    copyImgBtn.className = 'raven-btn';
    copyImgBtn.type = 'button';
    copyImgBtn.textContent = 'Copy Image';
    actions.appendChild(copyTextBtn);
    actions.appendChild(copyImgBtn);
    content.appendChild(textArea);
    content.appendChild(actions);

    resultPopup.appendChild(header);
    resultPopup.appendChild(preview);
    resultPopup.appendChild(content);

    document.body.appendChild(resultPopup);
    previewImage.src = imgUrl;

    // --- Auto-Hide Logic ---
    let hideTimer;
    const AUTO_HIDE_DELAY = 3500; // 3.5 seconds

    function stopHideTimer() {
      clearTimeout(hideTimer);
    }

    function startHideTimer() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (resultPopup && document.body.contains(resultPopup)) {
          resultPopup.classList.add('hiding');
          // Wait for transition to finish before removing
          setTimeout(() => {
            if (resultPopup && document.body.contains(resultPopup)) {
              resultPopup.remove();
              resultPopup = null;
            }
          }, 300);
        }
      }, AUTO_HIDE_DELAY);
    }

    function resumeHideTimerIfIdle() {
      if (!resultPopup || !document.body.contains(resultPopup)) {
        return;
      }

      const activeElement = document.activeElement;
      if (resultPopup.matches(':hover') || (activeElement && resultPopup.contains(activeElement))) {
        return;
      }

      startHideTimer();
    }

    // Start timer initially
    startHideTimer();

    // Pause on interaction
    resultPopup.addEventListener('mouseenter', stopHideTimer);
    resultPopup.addEventListener('mouseleave', startHideTimer);
    resultPopup.addEventListener('focusin', stopHideTimer);
    resultPopup.addEventListener('focusout', () => setTimeout(resumeHideTimerIfIdle, 0));
    resultPopup.addEventListener('touchstart', stopHideTimer, { passive: true });
    resultPopup.addEventListener('touchend', () => setTimeout(resumeHideTimerIfIdle, 800), { passive: true });

    // Event Bindings
    resultPopup.querySelector('.raven-close').onclick = () => {
      stopHideTimer();
      resultPopup.remove();
      resultPopup = null;
    };

    resultPopup.querySelector('#btn-copy-text').onclick = () => {
      const text = document.getElementById('raven-text-area').value;
      navigator.clipboard.writeText(text);
      showToast('Text copied', 'success');
      // Keep open if copied (user interaction) - restart timer
      startHideTimer();
    };

    resultPopup.querySelector('#btn-copy-img').onclick = async () => {
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        showToast('Image copied', 'success');
        startHideTimer();
      } catch (e) {
        showToast('Failed to copy image', 'error');
      }
    };
  }

  function showToast(msg, type) {
    const existing = document.querySelector('.raven-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'raven-ui raven-toast';
    toast.textContent = `✓ ${msg}`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

})();
