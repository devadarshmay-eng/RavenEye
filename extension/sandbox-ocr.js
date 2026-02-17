// RavenEye Sandbox OCR
// Runs in a sandboxed iframe with relaxed CSP (no restrictions on workers, WASM, eval)
// Communicates with parent (offscreen.js) via postMessage

let tesseractWorker = null;
let isReady = false;

// Pre-initialize Tesseract worker on load for faster first OCR
initWorker().then(() => {
    isReady = true;
    // Signal readiness to parent
    window.parent.postMessage({ action: 'SANDBOX_READY' }, '*');
    console.log('[RavenEye Sandbox] Ready');
}).catch(err => {
    console.error('[RavenEye Sandbox] Init failed:', err);
    // Still signal ready — will retry on first OCR request
    window.parent.postMessage({ action: 'SANDBOX_READY' }, '*');
});

// Listen for OCR requests from parent (offscreen.js)
window.addEventListener('message', async (e) => {
    if (e.data.action === 'RUN_OCR') {
        const requestId = e.data.requestId;
        try {
            const text = await performOCR(e.data.dataUrl);
            window.parent.postMessage({
                action: 'OCR_RESULT',
                requestId: requestId,
                success: true,
                text: text
            }, '*');
        } catch (err) {
            window.parent.postMessage({
                action: 'OCR_RESULT',
                requestId: requestId,
                success: false,
                error: err.message
            }, '*');
        }
    }
});

async function initWorker() {
    if (tesseractWorker) return tesseractWorker;

    console.log('[RavenEye Sandbox] Initializing Tesseract worker...');
    tesseractWorker = await Tesseract.createWorker('eng', 1, {
        workerPath: 'lib/worker.min.js',
        corePath: 'lib',
        langPath: 'lib',
        gzip: true,
        logger: (m) => {
            if (m.status) {
                console.log('[RavenEye OCR]', m.status, Math.round((m.progress || 0) * 100) + '%');
            }
        }
    });

    console.log('[RavenEye Sandbox] Tesseract worker ready');
    return tesseractWorker;
}

async function performOCR(dataUrl) {
    if (!tesseractWorker) {
        await initWorker();
    }

    const result = await tesseractWorker.recognize(dataUrl);
    return result.data.text.trim();
}
