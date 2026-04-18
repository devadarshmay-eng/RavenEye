import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from 'playwright';

const LOGIN_URL = 'https://partner.microsoft.com/dashboard/microsoftedge/public/login?ref=dd';

const rl = readline.createInterface({ input, output });
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  console.log('[edge:onboarding] Opening Partner Center login...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await rl.question(
    '[edge:onboarding] Complete account sign-in/registration in the browser, then press Enter here to continue...'
  );

  console.log('[edge:onboarding] Next steps (manual inside Partner Center):');
  console.log('1) Create your extension product once in dashboard.');
  console.log('2) Open Microsoft Edge > Publish API and click "Enable" then "Create API credentials".');
  console.log('3) Copy Product ID, Client ID, and API key.');
  console.log('4) Save them as GitHub Actions secrets: EDGE_PRODUCT_ID, EDGE_CLIENT_ID, EDGE_API_KEY.');
  console.log('');
  console.log('Example commands:');
  console.log('gh secret set EDGE_PRODUCT_ID --repo <owner>/<repo>');
  console.log('gh secret set EDGE_CLIENT_ID --repo <owner>/<repo>');
  console.log('gh secret set EDGE_API_KEY --repo <owner>/<repo>');

  await rl.question('[edge:onboarding] Press Enter to close the browser...');
} finally {
  rl.close();
  await context.close();
  await browser.close();
}
