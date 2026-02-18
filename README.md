# 🦅 RavenEye

> **Select. Extract. Done.** — A browser extension that extracts text from any region you select on screen using OCR.

![RavenEye Banner](docs/banner.png)

[![Version](https://img.shields.io/badge/version-1.0.0-purple)](https://github.com/yourusername/raveneye/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## ✨ What is RavenEye?

RavenEye is a Chrome/Brave/Edge browser extension that lets you **draw a selection rectangle** on any part of your screen and instantly **extracts all text** from that region using OCR (Optical Character Recognition).

Think of it like Windows Snipping Tool — but instead of saving a screenshot, it reads the text inside and copies it to your clipboard automatically.

---

## 🚀 Features

- **Click-drag selection** — Draw any rectangle on screen to capture text
- **Instant OCR** — Powered by OCR.space API for fast, accurate text extraction
- **Auto-copy to clipboard** — Text is copied the moment OCR completes
- **Save image** — Optionally download the captured region as PNG
- **Keyboard shortcut** — `Ctrl+Shift+E` (Windows/Linux) / `Cmd+Shift+E` (Mac)
- **Customizable dim & blur** — Control how the screen looks during selection
- **7 accent colors** — Personalize the UI to your taste
- **Smart compression** — Automatically compresses large captures for optimal OCR

---

## 📸 How It Works

```
1. Press Ctrl+Shift+E  (or click the extension icon → Activate Capture)
2. Screen dims
3. Draw a rectangle over any text on screen
4. OCR extracts text from the selection
5. Text is copied to clipboard + shown in popup
```

---

## 🔧 Installation

```bash
# 1. Clone this repo
git clone https://github.com/yourusername/raveneye.git
cd raveneye

# 2. Open your browser and navigate to:
chrome://extensions/       # Chrome
brave://extensions/        # Brave
edge://extensions/         # Edge

# 3. Enable "Developer mode" (top right toggle)

# 4. Click "Load unpacked"

# 5. Select the /extension folder from this repo

# 6. Done! 🦅 RavenEye is now in your toolbar
```

---

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| Dim Intensity | 50% | How dark the backdrop gets during selection |
| Blur Effect | 0px | Blur strength of the backdrop |
| Save Image | Off | Auto-download the captured region as PNG |
| Auto-copy Text | On | Automatically copy extracted text to clipboard |
| Accent Color | Purple | UI highlight color (7 options) |

---

## 🗂️ Project Structure

```
raveneye/
├── extension/
│   ├── manifest.json       # Extension config (MV3)
│   ├── background.js       # Service worker — shortcut + capture
│   ├── content.js          # Overlay, selection, OCR logic
│   ├── content.css         # Selection UI styles
│   ├── popup.html          # Settings popup
│   ├── popup.js            # Settings logic
│   └── icons/              # Extension icons (16, 32, 48, 128px)
├── docs/
│   └── roadmap.md
├── .github/
│   └── workflows/
│       └── release.yml     # Auto-release workflow
├── README.md
└── LICENSE
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Extension API | Chrome MV3 (Manifest V3) |
| OCR Engine | [OCR.space API](https://ocr.space/) |
| Screen Capture | `chrome.tabs.captureVisibleTab` |
| Storage | `chrome.storage.sync` |
| UI | Vanilla HTML/CSS/JS |

---

## 🔮 Roadmap

- [ ] Multi-language OCR support
- [ ] History of recent captures
- [ ] Firefox support (WebExtensions API)
- [ ] AI-powered text cleanup (fix OCR errors)
- [ ] Region annotation before capture
- [ ] PDF text extraction mode

---

## 📜 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <b>🦅 RavenEye</b> — See everything. Capture anything.
</div>
