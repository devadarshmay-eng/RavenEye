// RavenEye Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const dimSlider = document.getElementById('dimSlider');
  const blurSlider = document.getElementById('blurSlider');
  const tipDurationSlider = document.getElementById('tipDurationSlider');
  const dimVal = document.getElementById('dimVal');
  const blurVal = document.getElementById('blurVal');
  const tipDurationVal = document.getElementById('tipDurationVal');
  const saveImageToggle = document.getElementById('saveImageToggle');
  const autoCopyToggle = document.getElementById('autoCopyToggle');
  const showCaptureDetailsToggle = document.getElementById('showCaptureDetailsToggle');
  const captureBtn = document.getElementById('captureBtn');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const toast = document.getElementById('saved-toast');

  let currentAccent = '#7C3AED';

  // Load saved settings
  chrome.storage.sync.get({
    dimIntensity: 50,
    blurIntensity: 0,
    saveImage: false,
    autoCopy: true,
    accentColor: '#7C3AED',
    tipDuration: 4,
    showCaptureDetails: false
  }, (settings) => {
    dimSlider.value = settings.dimIntensity;
    dimVal.textContent = settings.dimIntensity + '%';

    blurSlider.value = settings.blurIntensity;
    blurVal.textContent = settings.blurIntensity + 'px';

    saveImageToggle.checked = settings.saveImage;
    autoCopyToggle.checked = settings.autoCopy;
    showCaptureDetailsToggle.checked = settings.showCaptureDetails;

    tipDurationSlider.value = settings.tipDuration;
    tipDurationVal.textContent = settings.tipDuration + 's';

    currentAccent = settings.accentColor;
    updateActiveSwatch(currentAccent);
    applyAccentColor(currentAccent);
  });

  // Capture button — delegates to background script so popup can close safely
  captureBtn.addEventListener('click', () => {
    // Tell the background script to activate capture
    // The background script persists after popup closes
    chrome.runtime.sendMessage({ action: 'ACTIVATE_FROM_POPUP' }, () => {
      // Close popup after message is sent
      window.close();
    });
  });

  // Dim slider
  dimSlider.addEventListener('input', () => {
    dimVal.textContent = dimSlider.value + '%';
    saveSettings();
  });

  // Blur slider
  blurSlider.addEventListener('input', () => {
    blurVal.textContent = blurSlider.value + 'px';
    saveSettings();
  });

  // Toggles
  saveImageToggle.addEventListener('change', saveSettings);
  autoCopyToggle.addEventListener('change', saveSettings);
  showCaptureDetailsToggle.addEventListener('change', saveSettings);

  // Tip Duration slider
  tipDurationSlider.addEventListener('input', () => {
    tipDurationVal.textContent = tipDurationSlider.value + 's';
    saveSettings();
  });

  // Color swatches
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      currentAccent = swatch.dataset.color;
      updateActiveSwatch(currentAccent);
      saveSettings();
    });
  });

  function updateActiveSwatch(color) {
    colorSwatches.forEach(s => {
      s.classList.toggle('active', s.dataset.color === color);
    });
    applyAccentColor(color);
  }

  // Convert hex to HSL, generate lighter + border variants, update CSS vars
  function applyAccentColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);

    const root = document.documentElement;
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-l', `hsl(${h}, ${Math.min(s + 15, 100)}%, ${Math.min(l + 25, 90)}%)`);
    root.style.setProperty('--border', `hsla(${h}, ${s}%, ${l}%, 0.25)`);

    // Update capture button gradient
    const btn = document.querySelector('.capture-btn');
    if (btn) {
      const darkerL = Math.max(l - 10, 10);
      btn.style.background = `linear-gradient(135deg, ${hex}, hsl(${h}, ${s}%, ${darkerL}%))`;
      btn.style.boxShadow = `0 4px 18px hsla(${h}, ${s}%, ${l}%, 0.35)`;
    }

    // Update toast bg
    const toastEl = document.getElementById('saved-toast');
    if (toastEl) toastEl.style.background = hex;
  }

  function saveSettings() {
    chrome.storage.sync.set({
      dimIntensity: parseInt(dimSlider.value),
      blurIntensity: parseInt(blurSlider.value),
      saveImage: saveImageToggle.checked,
      autoCopy: autoCopyToggle.checked,
      showCaptureDetails: showCaptureDetailsToggle.checked,
      accentColor: currentAccent,
      tipDuration: parseInt(tipDurationSlider.value)
    }, () => {
      showToast();
    });
  }

  let toastTimeout;
  function showToast(msg) {
    clearTimeout(toastTimeout);
    toast.textContent = msg || '✓ Settings saved';
    toast.classList.add('show');
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 1800);
  }
});
