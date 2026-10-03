import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: isProd ? required('JWT_SECRET') : process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // Serve the built React app from Express (useful for Docker/Coolify).
  // With Nginx you can leave this off and let Nginx serve client/dist.
  serveClient: process.env.SERVE_CLIENT === 'true',
  clientDist: process.env.CLIENT_DIST || new URL('../../client/dist', import.meta.url).pathname,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:5173',

  notify: {
    // console | whatsapp
    whatsappProvider: process.env.WHATSAPP_PROVIDER || 'console',
    // console | notifylk
    smsProvider: process.env.SMS_PROVIDER || 'console',
    workerIntervalMs: Number(process.env.WORKER_INTERVAL_MS || 5000),
    maxAttempts: Number(process.env.NOTIFY_MAX_ATTEMPTS || 4),
    whatsapp: {
      token: process.env.WHATSAPP_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
      // "template" (required for business-initiated messages) or "text" (only inside 24h customer window)
      mode: process.env.WHATSAPP_MODE || 'template',
    },
    notifylk: {
      userId: process.env.NOTIFYLK_USER_ID || '',
      apiKey: process.env.NOTIFYLK_API_KEY || '',
      senderId: process.env.NOTIFYLK_SENDER_ID || 'NotifyDEMO',
    },
  },
};
