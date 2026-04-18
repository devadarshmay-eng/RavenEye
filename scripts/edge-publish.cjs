const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.addons.microsoftedge.microsoft.com/v1';

function getArgValue(flag, defaultValue = undefined) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return defaultValue;
  }
  return process.argv[index + 1];
}

function parseBoolean(value, defaultValue) {
  if (value === undefined) return defaultValue;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[edge:publish] Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function getHeaders(withContentType) {
  const apiKey = ensureEnv('EDGE_API_KEY');
  const clientId = ensureEnv('EDGE_CLIENT_ID');
  const headers = {
    Authorization: `ApiKey ${apiKey}`,
    'X-ClientID': clientId
  };
  if (withContentType) {
    headers['Content-Type'] = withContentType;
  }
  return headers;
}

function getOperationIdFromLocation(response) {
  const location = response.headers.get('location') || response.headers.get('Location');
  if (!location) {
    throw new Error('[edge:publish] API response missing Location header for operation ID');
  }
  const operationId = location.split('/').pop();
  if (!operationId) {
    throw new Error(`[edge:publish] Could not parse operation ID from Location header: ${location}`);
  }
  return operationId;
}

async function pollOperation(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders()
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`[edge:publish] Operation status request failed (${response.status}): ${body}`);
    }

    const body = await response.json();
    const status = body.status || 'Unknown';
    console.log(`[edge:publish] Operation ${body.id || 'unknown'} status: ${status}`);

    if (status === 'Succeeded') {
      return body;
    }
    if (status === 'Failed') {
      throw new Error(`[edge:publish] Operation failed: ${JSON.stringify(body)}`);
    }

    await wait(5000);
  }

  throw new Error(`[edge:publish] Operation timed out after ${Math.floor(timeoutMs / 1000)} seconds`);
}

async function uploadPackage(productId, packagePath, timeoutMs) {
  const packageBuffer = fs.readFileSync(packagePath);
  const uploadUrl = `${API_BASE}/products/${productId}/submissions/draft/package`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: getHeaders('application/zip'),
    body: packageBuffer
  });

  if (response.status !== 202) {
    const body = await response.text();
    throw new Error(`[edge:publish] Upload failed (${response.status}): ${body}`);
  }

  const operationId = getOperationIdFromLocation(response);
  const pollUrl = `${API_BASE}/products/${productId}/submissions/draft/package/operations/${operationId}`;
  console.log(`[edge:publish] Package upload accepted, operation=${operationId}`);
  return pollOperation(pollUrl, timeoutMs);
}

async function publishSubmission(productId, notes, timeoutMs) {
  const publishUrl = `${API_BASE}/products/${productId}/submissions`;
  const response = await fetch(publishUrl, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify({ notes })
  });

  if (response.status !== 202) {
    const body = await response.text();
    throw new Error(`[edge:publish] Publish failed (${response.status}): ${body}`);
  }

  const operationId = getOperationIdFromLocation(response);
  const pollUrl = `${API_BASE}/products/${productId}/submissions/operations/${operationId}`;
  console.log(`[edge:publish] Publish accepted, operation=${operationId}`);
  return pollOperation(pollUrl, timeoutMs);
}

async function main() {
  const packageArg = getArgValue('--package');
  const shouldPublish = parseBoolean(getArgValue('--publish'), false);
  const timeoutSeconds = Number(getArgValue('--timeout-seconds', '900'));
  const timeoutMs = timeoutSeconds * 1000;
  const notes =
    getArgValue('--notes') ||
    process.env.EDGE_PUBLISH_NOTES ||
    'Automated submission from RavenEye release workflow.';

  const packagePath = path.resolve(packageArg || path.join('dist-artifacts', 'raveneye-v' + require(path.join(__dirname, '..', 'package.json')).version + '.zip'));
  if (!fs.existsSync(packagePath)) {
    throw new Error(`[edge:publish] Package not found: ${packagePath}`);
  }

  const productId = ensureEnv('EDGE_PRODUCT_ID');
  console.log(`[edge:publish] Uploading package for product ${productId}`);

  await uploadPackage(productId, packagePath, timeoutMs);
  console.log('[edge:publish] Package upload completed');

  if (!shouldPublish) {
    console.log('[edge:publish] Publish step skipped (--publish=false). Draft submission is updated.');
    return;
  }

  await publishSubmission(productId, notes, timeoutMs);
  console.log('[edge:publish] Publish completed');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
