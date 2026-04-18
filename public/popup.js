// RavenEye Popup Script

document.addEventListener("DOMContentLoaded", () => {
  const root = document.documentElement;
  const captureBtn = document.getElementById("captureBtn");
  const dimSlider = document.getElementById("dimSlider");
  const blurSlider = document.getElementById("blurSlider");
  const dimVal = document.getElementById("dimVal");
  const blurVal = document.getElementById("blurVal");
  const saveImageToggle = document.getElementById("saveImageToggle");
  const autoCopyToggle = document.getElementById("autoCopyToggle");
  const themeToggle = document.getElementById("themeToggle");
  const toast = document.getElementById("saved-toast");

  if (!captureBtn || !dimSlider || !blurSlider || !dimVal || !blurVal || !saveImageToggle || !autoCopyToggle || !themeToggle || !toast) {
    return;
  }

  const defaultSettings = {
    dimIntensity: 50,
    blurIntensity: 0,
    saveImage: false,
    autoCopy: true,
    theme: "dark"
  };

  function normalizeTheme(theme) {
    return theme === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    const nextTheme = normalizeTheme(theme);
    root.setAttribute("data-theme", nextTheme);
    themeToggle.checked = nextTheme === "dark";
  }

  chrome.storage.sync.get(defaultSettings, (settings) => {
    dimSlider.value = settings.dimIntensity;
    blurSlider.value = settings.blurIntensity;
    dimVal.textContent = `${settings.dimIntensity}%`;
    blurVal.textContent = `${settings.blurIntensity}px`;
    saveImageToggle.checked = settings.saveImage;
    autoCopyToggle.checked = settings.autoCopy;
    applyTheme(settings.theme);
  });

  captureBtn.addEventListener("click", () => {
    captureBtn.disabled = true;
    chrome.runtime.sendMessage({ action: "ACTIVATE_FROM_POPUP" }, (response) => {
      captureBtn.disabled = false;
      if (chrome.runtime.lastError) {
        showToast(`❌ ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!response || !response.success) {
        showToast(`❌ ${response?.error || "Capture could not start. Open a normal website and try again."}`);
        return;
      }

      window.close();
    });
  });

  dimSlider.addEventListener("input", () => {
    dimVal.textContent = `${dimSlider.value}%`;
    saveSettings();
  });

  blurSlider.addEventListener("input", () => {
    blurVal.textContent = `${blurSlider.value}px`;
    saveSettings();
  });

  saveImageToggle.addEventListener("change", saveSettings);
  autoCopyToggle.addEventListener("change", saveSettings);
  themeToggle.addEventListener("change", saveSettings);

  function saveSettings() {
    const settingsToSave = {
      dimIntensity: parseInt(dimSlider.value, 10),
      blurIntensity: parseInt(blurSlider.value, 10),
      saveImage: saveImageToggle.checked,
      autoCopy: autoCopyToggle.checked,
      theme: themeToggle.checked ? "dark" : "light"
    };

    applyTheme(settingsToSave.theme);

    chrome.storage.sync.set(settingsToSave, () => {
      showToast("✓ Settings saved");
    });
  }

  let toastTimeout;
  function showToast(message) {
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 1800);
  }
});
