// RavenEye Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const dimSlider = document.getElementById('dimSlider');
  const blurSlider = document.getElementById('blurSlider');
  const tipDurationSlider = document.getElementById('tipDurationSlider'); // May not exist
  const dimVal = document.getElementById('dimVal');
  const blurVal = document.getElementById('blurVal');
  const tipDurationVal = document.getElementById('tipDurationVal'); // May not exist
  const saveImageToggle = document.getElementById('saveImageToggle');
  const autoCopyToggle = document.getElementById('autoCopyToggle');
  const showCaptureDetailsToggle = document.getElementById('showCaptureDetailsToggle'); // May not exist
  const captureBtn = document.getElementById('captureBtn');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const toast = document.getElementById('saved-toast');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiSectionToggle = document.getElementById('apiSectionToggle');
  const apiConfigContent = document.getElementById('apiConfigContent');
  const apiToggleIcon = document.getElementById('apiToggleIcon');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');
  const apiKeySaveStatus = document.getElementById('apiKeySaveStatus');

  let currentAccent = '#7C3AED';
  let apiSectionExpanded = false;

  // Load saved settings
  chrome.storage.sync.get({
    dimIntensity: 50,
    blurIntensity: 0,
    saveImage: false,
    autoCopy: true,
    accentColor: '#7C3AED',
    tipDuration: 4,
    showCaptureDetails: false,
    ocrApiKey: ''
  }, (settings) => {
    dimSlider.value = settings.dimIntensity;
    dimVal.textContent = settings.dimIntensity + '%';

    blurSlider.value = settings.blurIntensity;
    blurVal.textContent = settings.blurIntensity + 'px';

    saveImageToggle.checked = settings.saveImage;
    autoCopyToggle.checked = settings.autoCopy;
    if (showCaptureDetailsToggle) {
      showCaptureDetailsToggle.checked = settings.showCaptureDetails;
    }

    if (tipDurationSlider && tipDurationVal) {
      tipDurationSlider.value = settings.tipDuration;
      tipDurationVal.textContent = settings.tipDuration + 's';
    }

    apiKeyInput.value = settings.ocrApiKey || '';

    // Auto-collapse API section if key is already set
    if (settings.ocrApiKey && settings.ocrApiKey.trim()) {
      apiSectionExpanded = false;
      toggleApiSection(false);
    } else {
      // Keep it expanded for first-time setup
      apiSectionExpanded = true;
      toggleApiSection(true);
    }

    currentAccent = settings.accentColor;
    updateActiveSwatch(currentAccent);
    applyAccentColor(currentAccent);
  });

  // Capture button
  captureBtn.addEventListener('click', () => {
    captureBtn.disabled = true;
    chrome.runtime.sendMessage({ action: 'ACTIVATE_FROM_POPUP' }, (response) => {
      captureBtn.disabled = false;
      if (chrome.runtime.lastError) {
        showToast(`❌ ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!response || !response.success) {
        showToast(`❌ ${response?.error || 'Capture could not start. Open a normal website and try again.'}`);
        return;
      }

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

  // API Key input - auto save on change
  apiKeyInput.addEventListener('input', () => {
    saveSettings();
  });

  // API Section Toggle
  apiSectionToggle.addEventListener('click', () => {
    apiSectionExpanded = !apiSectionExpanded;
    toggleApiSection(apiSectionExpanded);
  });

  function toggleApiSection(expand) {
    if (expand) {
      apiConfigContent.style.maxHeight = apiConfigContent.scrollHeight + 'px';
      apiToggleIcon.style.transform = 'rotate(180deg)';
    } else {
      apiConfigContent.style.maxHeight = '0';
      apiToggleIcon.style.transform = 'rotate(0deg)';
    }
  }

  // API Key Visibility Toggle
  toggleApiKeyVisibility.addEventListener('click', () => {
    const type = apiKeyInput.type === 'password' ? 'text' : 'password';
    apiKeyInput.type = type;
    toggleApiKeyVisibility.textContent = type === 'password' ? '👁️' : '🙈';
  });

  // Save API Key Button
  saveApiKeyBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showApiKeyStatus('⚠️ API key is required', 'error');
      return;
    }

    chrome.storage.sync.set({ ocrApiKey: apiKey }, () => {
      showApiKeyStatus('✓ API key saved successfully!', 'success');
      
      // Auto-collapse section after 2 seconds
      setTimeout(() => {
        apiSectionExpanded = false;
        toggleApiSection(false);
      }, 2000);
    });
  });

  function showApiKeyStatus(message, type) {
    apiKeySaveStatus.textContent = message;
    apiKeySaveStatus.style.color = type === 'success' ? '#22c55e' : '#ef4444';
    
    setTimeout(() => {
      apiKeySaveStatus.textContent = '';
    }, 3000);
  }

  // Toggles
  saveImageToggle.addEventListener('change', saveSettings);
  autoCopyToggle.addEventListener('change', saveSettings);
  if (showCaptureDetailsToggle) {
    showCaptureDetailsToggle.addEventListener('change', saveSettings);
  }

  // Tip Duration slider
  if (tipDurationSlider && tipDurationVal) {
    tipDurationSlider.addEventListener('input', () => {
      tipDurationVal.textContent = tipDurationSlider.value + 's';
      saveSettings();
    });
  }

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

    const btn = document.querySelector('.capture-btn');
    if (btn) {
      const darkerL = Math.max(l - 10, 10);
      btn.style.background = `linear-gradient(135deg, ${hex}, hsl(${h}, ${s}%, ${darkerL}%))`;
      btn.style.boxShadow = `0 4px 18px hsla(${h}, ${s}%, ${l}%, 0.35)`;
    }

    const toastEl = document.getElementById('saved-toast');
    if (toastEl) toastEl.style.background = hex;
  }

  function saveSettings() {
    const settingsToSave = {
      dimIntensity: parseInt(dimSlider.value),
      blurIntensity: parseInt(blurSlider.value),
      saveImage: saveImageToggle.checked,
      autoCopy: autoCopyToggle.checked,
      accentColor: currentAccent,
      ocrApiKey: apiKeyInput.value.trim()
    };

    // Only add optional fields if elements exist
    if (showCaptureDetailsToggle) {
      settingsToSave.showCaptureDetails = showCaptureDetailsToggle.checked;
    }
    if (tipDurationSlider) {
      settingsToSave.tipDuration = parseInt(tipDurationSlider.value);
    }

    chrome.storage.sync.set(settingsToSave, () => {
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
