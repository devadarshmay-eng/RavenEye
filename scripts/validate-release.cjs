const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const manifestPath = path.join(root, 'public', 'manifest.json');
const policyPath = path.join(root, 'release', 'policy-contract.json');
const listingPath = path.join(root, 'release', 'edge-listing.json');
const privacyPolicyPath = path.join(root, 'privacy-policy.html');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[release:validate] ${message}`);
  }
}

function asSortedUnique(values) {
  return [...new Set(values)].sort();
}

function checkRequiredString(source, key, label) {
  assert(typeof source[key] === 'string' && source[key].trim().length > 0, `${label} is missing or empty`);
}

const pkg = readJson(packagePath);
const manifest = readJson(manifestPath);
const policy = readJson(policyPath);
const listing = readJson(listingPath);
const privacyPolicy = fs.readFileSync(privacyPolicyPath, 'utf8');

assert(pkg.version === manifest.version, `package.json version (${pkg.version}) must match manifest version (${manifest.version})`);

const allowedPermissions = asSortedUnique(policy.permissions.allowed || []);
const declaredPermissions = asSortedUnique(manifest.permissions || []);
assert(
  JSON.stringify(allowedPermissions) === JSON.stringify(declaredPermissions),
  `manifest permissions ${JSON.stringify(declaredPermissions)} must exactly match policy contract ${JSON.stringify(allowedPermissions)}`
);

const allowedHosts = asSortedUnique(policy.hostPermissions.allowed || []);
const declaredHosts = asSortedUnique(manifest.host_permissions || []);
assert(
  JSON.stringify(allowedHosts) === JSON.stringify(declaredHosts),
  `manifest host_permissions ${JSON.stringify(declaredHosts)} must exactly match policy contract ${JSON.stringify(allowedHosts)}`
);

checkRequiredString(manifest, 'name', 'manifest.name');
checkRequiredString(manifest, 'description', 'manifest.description');
checkRequiredString(manifest, 'homepage_url', 'manifest.homepage_url');

assert(manifest.homepage_url.startsWith('https://'), 'manifest.homepage_url must use HTTPS');
assert(
  policy.policyRequirements.privacyPolicyUrl.startsWith('https://'),
  'policy privacyPolicyUrl must use HTTPS'
);

const requiredIcons = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];
for (const icon of requiredIcons) {
  const iconPath = path.join(root, 'public', 'icons', icon);
  assert(fs.existsSync(iconPath), `missing required icon file: public/icons/${icon}`);
}

checkRequiredString(listing, 'extensionName', 'edge-listing.extensionName');
checkRequiredString(listing, 'category', 'edge-listing.category');
checkRequiredString(listing, 'shortDescription', 'edge-listing.shortDescription');
checkRequiredString(listing, 'longDescription', 'edge-listing.longDescription');
checkRequiredString(listing, 'privacyPolicyUrl', 'edge-listing.privacyPolicyUrl');
checkRequiredString(listing, 'websiteUrl', 'edge-listing.websiteUrl');
checkRequiredString(listing, 'supportUrl', 'edge-listing.supportUrl');

assert(
  listing.privacyPolicyUrl === policy.policyRequirements.privacyPolicyUrl,
  'edge-listing privacyPolicyUrl must match policy contract privacyPolicyUrl'
);
assert(
  listing.websiteUrl === policy.policyRequirements.homepageUrl,
  'edge-listing websiteUrl must match policy contract homepageUrl'
);

if (policy.policyRequirements.mustMentionThirdPartyOCR) {
  assert(
    privacyPolicy.includes('OCR relay') || privacyPolicy.includes('OCR provider'),
    'privacy-policy.html must mention OCR provider usage'
  );
}

if (policy.policyRequirements.mustMentionLocalSettingsStorage) {
  assert(
    privacyPolicy.includes('chrome.storage.sync'),
    'privacy-policy.html must mention local settings storage'
  );
}

console.log('[release:validate] OK - release policy and listing metadata checks passed');
