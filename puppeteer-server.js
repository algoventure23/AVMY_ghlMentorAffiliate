const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3001; // Change to 3002 if 3001 is in use

app.use(cors());
app.use(bodyParser.json());

const log = (message) => {
  console.log(`[Puppeteer] ${message}`);
  fs.appendFileSync('puppeteer.log', `${new Date().toISOString()} - ${message}\n`);
};

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
];

const typeSlowly = async (page, selector, text, baseDelay = 300) => {
  log(`Typing into ${selector}: ${text}`);
  try {
    await page.click(selector, { clickCount: 1 });
    for (const char of text) {
      await page.keyboard.type(char);
      await new Promise(resolve => setTimeout(resolve, baseDelay + Math.floor(Math.random() * 100)));
    }
  } catch (err) {
    log(`Error typing into ${selector}: ${err.message}`);
    throw err;
  }
};

app.get('/health', (req, res) => {
  log('Health check requested');
  res.send('OK');
});

app.post('/click', async (req, res) => {
  const { url, name = 'John Doe', email = 'demo@example.com', phone = '98553475', holdMs = 0, keepOpen = false, attributionGraceMs = 3000, selectors = {} } = req.body;
  if (!url) {
    log('Missing URL in request');
    return res.status(400).json({ error: 'Missing URL' });
  }

  log(`Visiting URL: ${url}`);
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false, // Visible browser
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    log(`Setting user agent: ${userAgent}`);
    await page.setUserAgent(userAgent);
    await page.setViewport({ width: 1280, height: 720 });

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/',
      'DNT': '1'
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    });

    // Smart fallback navigation
    try {
      log('Loading with networkidle2...');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch {
      log('networkidle2 failed, trying domcontentloaded...');
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      } catch {
        log('domcontentloaded failed, trying load...');
        await page.goto(url, { waitUntil: 'load', timeout: 40000 });
      }
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Simulate human behavior
    log('Simulating mouse movements...');
    await page.mouse.move(100, 100, { steps: 25 });
    await new Promise(resolve => setTimeout(resolve, 800));
    await page.mouse.move(200, 300, { steps: 30 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.mouse.click(300, 500);
    await new Promise(resolve => setTimeout(resolve, 1000));

    await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await new Promise(resolve => setTimeout(resolve, 1500));

    log('Typing inputs slowly...');
    await typeSlowly(page, selectors.name || 'input[placeholder="Full Name"]', name, 300);
    await typeSlowly(page, selectors.email || 'input[placeholder="Email"]', email, 250);
    await typeSlowly(page, selectors.phone || 'input[placeholder="Phone"]', phone, 250);

    const dropdown = await page.$('select');
    if (dropdown) {
      log('Selecting dropdown option...');
      const options = await dropdown.$$eval('option', opts => opts.map(o => o.value));
      if (options.length > 1) await dropdown.select(options[1]);
    }

    await new Promise(resolve => setTimeout(resolve, 5000)); // Increased delay for button visibility

    // Wait for and click the button
    await page.waitForSelector('button', { visible: true, timeout: 10000 }); // Wait for button
    const clicked = await page.evaluate((buttonSelector) => {
      const log = (message) => console.log(`[Puppeteer] ${message}`);
      const btns = Array.from(document.querySelectorAll('button'));
      log(`Found ${btns.length} buttons on page`);
      const btnTexts = btns.map(b => b.textContent.trim().toLowerCase());
      log(`Button texts on page: ${btnTexts.join(', ')}`);
      const btn = btns.find(b => b.textContent.trim().toLowerCase().includes(buttonSelector || 'register my seat'));
      if (btn) {
        log(`Found button with text: ${btn.textContent.trim()}`);
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.focus();
        btn.click();
        log('Button clicked via evaluate');
        return true;
      }
      log('No matching button found');
      return false;
    }, selectors.button);

    if (!clicked && btns.length > 0) {
      // Fallback: Click the first button with mouse
      const firstBtn = btns[0];
      const rect = firstBtn.getBoundingClientRect();
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      log('Button clicked via mouse fallback on first button');
      clicked = true;
    }

    log(clicked ? '✅ Button clicked' : '❌ Button not found');

    let redirectedUrl = null;

    if (clicked) {
      try {
        log('⏳ Waiting for /confirmation-s redirect...');
        await page.waitForFunction(
          () => window.location.href.includes('/confirmation-s'),
          { timeout: 25000 }
        );
        redirectedUrl = await page.url();
        log('✅ Redirected to:', redirectedUrl);
      } catch (e) {
        log('⚠️ No redirect occurred within 25 seconds.');
        redirectedUrl = await page.url();
        log(`Current URL: ${redirectedUrl}`);
      }
    }

    const attributionResult = await page.evaluate(() => {
      if (typeof window._lc_attribution_submit === 'function') {
        window._lc_attribution_submit();
        return '✅ Attribution triggered';
      }
      return '⚠️ Attribution function not found';
    });

    await new Promise(resolve => setTimeout(resolve, 4000));

    res.json({
      success: clicked,
      redirectedTo: redirectedUrl,
      attributionResult
    });

  } catch (err) {
    log(`❌ Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser && !keepOpen) {
      await browser.close();
      log('🧹 Browser closed');
    } else if (keepOpen) {
      log('🌐 Browser kept open');
    }
  }
});

app.listen(PORT, () => {
  log(`Puppeteer server running at http://0.0.0.0:${PORT}`);
  log('Debug: Visible browser with button fix and fallback 2025-08-17');
});