// RavenEye Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const dimSlider = document.getElementById('dimSlider');
  const blurSlider = document.getElementById('blurSlider');
  const dimVal = document.getElementById('dimVal');
  const blurVal = document.getElementById('blurVal');
  const saveImageToggle = document.getElementById('saveImageToggle');
  const autoCopyToggle = document.getElementById('autoCopyToggle');
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
    accentColor: '#7C3AED'
  }, (settings) => {
    dimSlider.value = settings.dimIntensity;
    dimVal.textContent = settings.dimIntensity + '%';

    blurSlider.value = settings.blurIntensity;
    blurVal.textContent = settings.blurIntensity + 'px';

    saveImageToggle.checked = settings.saveImage;
    autoCopyToggle.checked = settings.autoCopy;

    currentAccent = settings.accentColor;
    updateActiveSwatch(currentAccent);
  });

  // Capture button
  captureBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'ACTIVATE_CAPTURE' }, (response) => {
          if (chrome.runtime.lastError) {
            // Inject content script if not loaded
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              files: ['content.js']
            });
            chrome.scripting.insertCSS({
              target: { tabId: tabs[0].id },
              files: ['content.css']
            });
            setTimeout(() => {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'ACTIVATE_CAPTURE' });
            }, 300);
          }
        });
        window.close(); // Close popup
      }
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
  }

  function saveSettings() {
    chrome.storage.sync.set({
      dimIntensity: parseInt(dimSlider.value),
      blurIntensity: parseInt(blurSlider.value),
      saveImage: saveImageToggle.checked,
      autoCopy: autoCopyToggle.checked,
      accentColor: currentAccent
    }, () => {
      showToast();
    });
  }

  let toastTimeout;
  function showToast() {
    clearTimeout(toastTimeout);
    toast.classList.add('show');
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 1800);
  }
});
