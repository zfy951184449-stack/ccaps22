const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(3000); // Wait for loading items
  const title = await page.title();
  const text = await page.evaluate(() => document.body.innerText);
  const classes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*')).map(el => el.className).filter(c => typeof c === 'string' && c.trim() !== '');
  });
  console.log('Title:', title);
  console.log('Body text snippet:', text.substring(0, 500));
  console.log('Class list snippet:', Array.from(new Set(classes)).slice(0, 20).join(', '));
  await page.screenshot({ path: 'output/dashboard_screenshot.png' });
  await browser.close();
})();
