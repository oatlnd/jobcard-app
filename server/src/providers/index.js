// Message providers. Each exports send(notification) -> { providerId } or throws.
import { config } from '../config.js';
import { PARAM_ORDER } from '../lib/notify.js';

const consoleProvider = (channel) => ({
  name: `console-${channel}`,
  async send(n) {
    console.log(`[${channel.toUpperCase()} -> ${n.to_number}] ${n.body}`);
    return { providerId: `console-${Date.now()}` };
  },
});

// Meta WhatsApp Cloud API (https://developers.facebook.com/docs/whatsapp/cloud-api)
const whatsappCloud = {
  name: 'whatsapp-cloud',
  async send(n) {
    const w = config.notify.whatsapp;
    if (!w.token || !w.phoneNumberId) throw new Error('WhatsApp is not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)');
    let payload;
    if (w.mode === 'text') {
      payload = { messaging_product: 'whatsapp', to: n.to_number, type: 'text', text: { body: n.body } };
    } else {
      const prefix = process.env.WHATSAPP_TEMPLATE_PREFIX ?? 'jobcard_';
      const order = PARAM_ORDER[n.template] || [];
      payload = {
        messaging_product: 'whatsapp',
        to: n.to_number,
        type: 'template',
        template: {
          name: `${prefix}${n.template}`,
          language: { code: n.lang === 'ta' ? 'ta' : (process.env.WHATSAPP_LANG_EN || 'en') },
          components: [{ type: 'body', parameters: order.map((k) => ({ type: 'text', text: String(n.params?.[k] ?? '-') || '-' })) }],
        },
      };
    }
    const res = await fetch(`https://graph.facebook.com/${w.apiVersion}/${w.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${data?.error?.message || 'request failed'}`);
    return { providerId: data?.messages?.[0]?.id || null };
  },
};

// Notify.lk SMS gateway (Sri Lanka) - https://developer.notify.lk
const notifyLk = {
  name: 'notifylk',
  async send(n) {
    const s = config.notify.notifylk;
    if (!s.userId || !s.apiKey) throw new Error('Notify.lk is not configured (NOTIFYLK_USER_ID / NOTIFYLK_API_KEY)');
    const qs = new URLSearchParams({ user_id: s.userId, api_key: s.apiKey, sender_id: s.senderId, to: n.to_number, message: n.body });
    // Tamil text needs unicode SMS
    if (/[^\x00-\x7F]/.test(n.body)) qs.set('type', 'unicode');
    const res = await fetch(`https://app.notify.lk/api/v1/send?${qs}`, { signal: AbortSignal.timeout(15000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'success') throw new Error(`Notify.lk: ${data?.errors ? JSON.stringify(data.errors) : data?.data || res.status}`);
    return { providerId: null };
  },
};

export function getProvider(channel) {
  if (channel === 'whatsapp') return config.notify.whatsappProvider === 'whatsapp' ? whatsappCloud : consoleProvider('whatsapp');
  if (channel === 'sms') return config.notify.smsProvider === 'notifylk' ? notifyLk : consoleProvider('sms');
  throw new Error(`Unknown channel ${channel}`);
}
