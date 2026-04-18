# RavenEye

RavenEye is a browser extension for Chrome-based browsers that captures any on-screen region and extracts text using OCR.

[![Version](https://img.shields.io/badge/version-1.0.1-a855f7?style=flat-square&logo=github)](https://github.com/devadarshmay-eng/RavenEye/releases)
[![License](https://img.shields.io/badge/license-MIT-3b82f6?style=flat-square)](https://github.com/devadarshmay-eng/RavenEye/blob/main/LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-V3-10b981?style=flat-square&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/)
[![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Brave%20%7C%20Edge-orange?style=flat-square)](https://github.com/devadarshmay-eng/RavenEye)

**Documentation:** https://devadarshmay-eng.github.io/RavenEye/  
**Privacy Policy:** https://devadarshmay-eng.github.io/RavenEye/privacy-policy.html

## Project Overview

RavenEye is designed for fast text capture from web pages, PDFs, videos, and visual content where direct copy is not available. It provides a lightweight capture flow and immediately returns extracted text for copying and reuse.

## Feature Highlights

- Keyboard shortcut and popup-based capture activation
- Region selection with configurable dim and blur overlay
- OCR extraction with automatic clipboard copy support
- Optional capture image download
- Theme-aware popup settings interface
- Documentation and privacy pages published via GitHub Pages

## Installation

### Local development (unpacked extension)

```bash
git clone https://github.com/devadarshmay-eng/RavenEye.git
cd RavenEye
npm install
```

1. Open `chrome://extensions/` (or `edge://extensions/` / `brave://extensions/`).
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `public/` folder.

### Build the marketplace bundle

```bash
npm run lint
npm run build
npm run release:validate
npm run release:package
```

Zip the **contents** of `dist-extension/` (not the parent folder).  
Use that ZIP for extension marketplace uploads.

## Edge Add-ons release automation

### One-time onboarding

1. Run the onboarding helper:

```bash
npm run edge:onboarding
```

2. In Partner Center, create your extension product and Publish API credentials.
3. Add GitHub secrets:
   - `EDGE_PRODUCT_ID`
   - `EDGE_CLIENT_ID`
   - `EDGE_API_KEY`

### Automated release pipeline

- Trigger **Edge Release Pipeline** workflow from GitHub Actions.
- Choose:
  - `publish = false` to upload draft only.
  - `publish = true` to upload and publish (protected by `edge-publish` environment approval).
- The workflow automatically runs:
  1. lint/build/preflight validation
  2. package + checksum generation
  3. GitHub release asset creation
  4. Edge Add-ons API upload/publish
  5. listing media artifact generation

## Manual Nano Banana icon workflow

If Nano Banana MCP is unavailable in this environment, generate icons manually in Google AI Studio:

1. Open Google AI Studio and choose image generation/editing with Gemini image model.
2. Prompt (recommended baseline):
   - `Design a professional minimalist raven-eye logo for a browser extension icon. No text. Premium dark navy to indigo gradient with subtle violet accent. High contrast and clean edges for small sizes.`
3. Export a square master image at high resolution (for example 1024x1024 PNG).
4. Resize/export to required extension icon sizes:
   - `16x16`, `32x32`, `48x48`, `128x128`
5. Replace these files in the repo:
   - `public/icons/icon16.png`
   - `public/icons/icon32.png`
   - `public/icons/icon48.png`
   - `public/icons/icon128.png`
6. Rebuild and validate:
   - `npm run build`
   - `npm run release:validate`

## Usage

1. Activate capture from the popup button or by pressing `Alt+Shift+E`.
2. Drag to select the target screen region.
3. Wait for OCR extraction to complete.
4. Copy text from the result view or save capture output, based on your settings.

## Screenshots

Use the following screenshot set for release listings:

1. Capture activation state
2. Selection overlay in-progress
3. OCR result output
4. Settings popup (dark theme)
5. Settings popup (light theme)

## Tech Stack

| Layer | Technology |
|---|---|
| Extension Platform | Chrome Extensions Manifest V3 |
| OCR Endpoint | OCR.space API |
| UI Runtime | React 18 + TypeScript + Vite |
| Storage | `chrome.storage.sync` |
| Styling | Tailwind CSS + Radix UI |

## Roadmap

- Multi-language OCR improvements
- Capture history and retrieval
- Firefox compatibility path
- OCR post-processing quality enhancements

## Contributing

1. Fork the repository and create a feature branch.
2. Keep changes scoped and production-safe.
3. Run `npm run lint` and `npm run build`.
4. Open a pull request with a clear summary and test notes.

## License

MIT — see [LICENSE](LICENSE).
