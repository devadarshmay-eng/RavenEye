<div align="center">

# 🦅 RavenEye

**Select. Extract. Done.**

A Chrome extension that extracts text from any region you select on screen — powered by OCR.

[![Version](https://img.shields.io/badge/version-1.0.0-a855f7?style=flat-square&logo=github)](https://github.com/devadarshmay-eng/RavenEye/releases)
[![License](https://img.shields.io/badge/license-MIT-3b82f6?style=flat-square)](https://github.com/devadarshmay-eng/RavenEye/blob/main/LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-V3-10b981?style=flat-square&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/)
[![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Brave%20%7C%20Edge-orange?style=flat-square)](https://github.com/devadarshmay-eng/RavenEye)

</div>

---

## 🔍 What is RavenEye?

**RavenEye** is a browser extension for Chrome, Brave, and Edge that lets you **draw a selection rectangle** over any part of your screen and instantly **extracts all the text** from that region using OCR (Optical Character Recognition).

Think of it like the Windows Snipping Tool — but instead of saving a screenshot, it **reads the text inside** and copies it to your clipboard automatically.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🖱️ **Click-drag selection** | Draw any rectangle on screen to capture a region |
| ⚡ **Instant OCR** | Powered by [OCR.space API](https://ocr.space/) for fast, accurate extraction |
| 📋 **Auto-copy to clipboard** | Text is copied the moment OCR completes |
| 💾 **Save image** | Optionally download the captured region as a PNG |
| ⌨️ **Keyboard shortcut** | `Ctrl+Shift+E` (Windows/Linux) · `Cmd+Shift+E` (Mac) |
| 🌑 **Customizable dim & blur** | Control how the screen looks during selection |
| 🎨 **7 accent colors** | Personalize the UI to your taste |
| 🗜️ **Smart compression** | Auto-compresses large captures for optimal OCR |

---

## 📸 How It Works

```
1.  Press Ctrl+Shift+E  — or click the extension icon → Activate Capture
2.  The screen dims
3.  Draw a rectangle over any text on screen
4.  OCR extracts text from the selection
5.  Text is copied to clipboard + shown in the popup
```

---

## 🔧 Installation

> **No build step required.** Load the extension directly from the repo.

```bash
# 1. Clone this repo
git clone https://github.com/devadarshmay-eng/RavenEye.git
cd RavenEye
```

Then load it in your browser:

1. Navigate to `chrome://extensions/` (or `brave://extensions/` / `edge://extensions/`)
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the **`extension/`** folder from this repo
5. Done! 🦅 RavenEye appears in your toolbar

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
RavenEye/
├── extension/              # Core browser extension (load this as unpacked)
│   ├── manifest.json       # Extension config (Manifest V3)
│   ├── background.js       # Service worker — shortcut & capture logic
│   ├── content.js          # Overlay, selection UI, OCR pipeline
│   ├── content.css         # Selection overlay styles
│   ├── popup.html          # Settings popup UI
│   ├── popup.js            # Settings logic
│   └── icons/              # Extension icons (16, 32, 48, 128px)
├── src/                    # React + Vite settings app (UI components)
│   ├── App.tsx
│   ├── components/
│   └── index.css
├── docs/
│   └── workflow-guide.html # Usage & workflow reference
├── scripts/                # Build / helper scripts
├── .github/
│   └── workflows/
│       └── release.yml     # Automated release workflow
├── public/
├── README.md
└── LICENSE
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Extension API | Chrome Manifest V3 |
| OCR Engine | [OCR.space API](https://ocr.space/) |
| Screen Capture | `chrome.tabs.captureVisibleTab` |
| Storage | `chrome.storage.sync` |
| Settings UI | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + Radix UI |

---

## 🔮 Roadmap

- [ ] Multi-language OCR support
- [ ] History of recent captures
- [ ] Firefox support (WebExtensions API)
- [ ] AI-powered text cleanup (fix OCR errors automatically)
- [ ] Region annotation before capture
- [ ] PDF text extraction mode

---

## ⚠️ Disclaimer

RavenEye relies on third-party OCR technology to extract text from screen captures. While it aims to be as accurate as possible, **results may not always be 100% correct** — OCR can make errors, especially with:

- Stylized fonts, handwriting, or decorative text
- Low-contrast or very small text
- Heavily curved, blurred, or rotated content
- Non-Latin scripts or rare languages

> **Always review the extracted text before relying on it for critical use.** RavenEye is a productivity aid, not a guaranteed transcript.

---

## 📜 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <b>🦅 RavenEye</b> — See everything. Capture anything.
  <br/><br/>
  Made with ❤️ by <a href="https://github.com/devadarshmay-eng">devadarshmay-eng</a>
</div>
