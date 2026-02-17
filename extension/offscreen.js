// RavenEye Offscreen Relay
// Bridges chrome.runtime messages (from background) <-> postMessage (to sandbox iframe)

const sandbox = document.getElementById('ocr-sandbox');
let sandboxReady = false;
const pendingRequests = new Map();

// Wait for sandbox to signal readiness
window.addEventListener('message', (e) => {
    if (e.data.action === 'SANDBOX_READY') {
        sandboxReady = true;
        console.log('[RavenEye Offscreen] Sandbox is ready');
        return;
    }

    if (e.data.action === 'OCR_RESULT') {
        const requestId = e.data.requestId;
        const resolver = pendingRequests.get(requestId);
        if (resolver) {
            pendingRequests.delete(requestId);
            resolver({
                success: e.data.success,
                text: e.data.text || '',
                error: e.data.error || ''
            });
        }
        return;
    }
});

// Listen for chrome.runtime messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return;

    if (message.action === 'PING') {
        sendResponse(sandboxReady ? 'READY' : 'LOADING');
        return;
    }

    if (message.action === 'RUN_OCR') {
        runOCR(message.dataUrl)
            .then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // async
    }
});

async function waitForSandbox(timeoutMs = 30000) {
    if (sandboxReady) return;
    const start = Date.now();
    while (!sandboxReady && (Date.now() - start) < timeoutMs) {
        await new Promise(r => setTimeout(r, 200));
    }
    if (!sandboxReady) {
        throw new Error('Sandbox did not become ready in time');
    }
}

async function runOCR(dataUrl) {
    await waitForSandbox();

    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    return new Promise((resolve, reject) => {
        // Set a timeout for the OCR operation
        const timeout = setTimeout(() => {
            pendingRequests.delete(requestId);
            reject(new Error('OCR timed out after 60 seconds'));
        }, 60000);

        pendingRequests.set(requestId, (result) => {
            clearTimeout(timeout);
            resolve(result);
        });

        // Send to sandbox iframe
        sandbox.contentWindow.postMessage({
            action: 'RUN_OCR',
            requestId: requestId,
            dataUrl: dataUrl
        }, '*');
    });
}
