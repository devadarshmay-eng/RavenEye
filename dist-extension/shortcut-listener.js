(function () {
  if (window.__raveneyeShortcutListenerInstalled) {
    return;
  }
  window.__raveneyeShortcutListenerInstalled = true;

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.repeat) {
        return;
      }

      const key = (event.key || "").toLowerCase();
      const isCtrlShiftE = event.ctrlKey && event.shiftKey && key === "e";
      const isAltShiftE = event.altKey && event.shiftKey && key === "e";
      if (!isCtrlShiftE && !isAltShiftE) {
        return;
      }

      const target = event.target;
      const tag = target?.tagName?.toLowerCase?.() || "";
      if (target?.isContentEditable || tag === "input" || tag === "textarea" || tag === "select") {
        return;
      }

      chrome.runtime.sendMessage({ action: "ACTIVATE_FROM_SHORTCUT" });
      event.preventDefault();
    },
    true
  );
})();
