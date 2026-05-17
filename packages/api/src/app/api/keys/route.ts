// ─────────────────────────────────────────────────────────────
// GET   /api/keys          — All API key metadata + health status
// POST  /api/keys/test     — Test a specific key (1-click)
// PATCH /api/keys/[service]— Update key metadata (preview, notes)
// ─────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { supabase, requireAuth, ok, err, serverErr } from '../../../lib/utils';
import { z } from 'zod';

// ─── GET all keys ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('service');

    if (error) return err(error.message);
    return ok({ keys: data });
  } catch (e) {
    return serverErr(e);
  }
}

// ─── POST /api/keys — test or update preview ──────────────────
const ActionSchema = z.object({
  action:  z.enum(['test', 'update_preview', 'mark_revoked', 'mark_active']),
  service: z.enum([
    'anthropic', 'openai', 'whatsapp', 'telegram',
    'calendly', 'resend', 'redis', 'brightdata',
    'apify', 'google_calendar', 'supabase_service',
  ]),
  key_preview: z.string().optional(),  // Last 4 chars, for update_preview
  notes:       z.string().optional(),
});

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  try {
    const body   = await req.json();
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.message);

    const { action, service } = parsed.data;

    switch (action) {
      // ── 1-click test connection ────────────────────────────
      case 'test': {
        const result = await testServiceConnection(service);

        // Update last_tested_at + result in DB
        await supabase.from('api_keys').update({
          last_tested_at: new Date().toISOString(),
          last_test_ok:   result.ok,
          last_error:     result.ok ? null : result.error,
        }).eq('service', service);

        // Log the test
        await supabase.from('system_logs').insert({
          level:    result.ok ? 'info' : 'error',
          source:   'api',
          message:  `API key test: ${service} — ${result.ok ? 'PASS' : 'FAIL'}`,
          metadata: { service, ok: result.ok, error: result.error },
        });

        return ok({ service, ...result });
      }

      // ── Update preview (after rotating key) ───────────────
      case 'update_preview': {
        await supabase.from('api_keys').update({
          key_preview: parsed.data.key_preview,
          notes:       parsed.data.notes,
          is_active:   true,
          last_error:  null,
        }).eq('service', service);

        return ok({ message: `Key preview updated for ${service}` });
      }

      // ── Mark as revoked (1-click disable) ─────────────────
      case 'mark_revoked': {
        await supabase.from('api_keys').update({
          is_active:  false,
          last_error: 'Manually revoked via admin panel',
        }).eq('service', service);

        await supabase.from('system_logs').insert({
          level:   'warn', source: 'api',
          message: `API key manually marked as revoked: ${service}`,
          metadata: { service },
        });

        return ok({ message: `${service} marked as revoked` });
      }

      // ── Mark as active (after adding new key to env) ───────
      case 'mark_active': {
        await supabase.from('api_keys').update({
          is_active:  true,
          last_error: null,
        }).eq('service', service);

        return ok({ message: `${service} marked as active` });
      }

      default:
        return err('Unknown action');
    }
  } catch (e) {
    return serverErr(e);
  }
}

// ─────────────────────────────────────────────────────────────
// Service connection testers
// Each calls the real service to verify the key works
// ─────────────────────────────────────────────────────────────
async function testServiceConnection(service: string): Promise<{ ok: boolean; error?: string; detail?: string }> {
  try {
    switch (service) {
      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key':         process.env.ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
            'Content-Type':      'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 5,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
        });
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      }

      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        });
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      }

      case 'whatsapp': {
        const res = await fetch(
          `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`,
          { headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}` } },
        );
        const data = await res.json();
        return { ok: res.ok, detail: data.display_phone_number, error: res.ok ? undefined : data?.error?.message };
      }

      case 'telegram': {
        const res  = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
        const data = await res.json();
        return { ok: data.ok, detail: data.result?.username, error: data.ok ? undefined : data.description };
      }

      case 'resend': {
        const res = await fetch('https://api.resend.com/domains', {
          headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
        });
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      }

      case 'apify': {
        const res = await fetch(`https://api.apify.com/v2/users/me`, {
          headers: { 'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}` },
        });
        const data = await res.json();
        return { ok: res.ok, detail: data.data?.username, error: res.ok ? undefined : data.error };
      }

      case 'redis': {
        // Test Redis by hitting queue service health endpoint
        const queueUrl = process.env.QUEUE_SERVICE_URL;
        if (!queueUrl) return { ok: false, error: 'QUEUE_SERVICE_URL not set' };
        const res = await fetch(`${queueUrl}/health`).catch(() => null);
        return { ok: res?.ok ?? false, error: res?.ok ? undefined : 'Queue service unreachable' };
      }

      case 'supabase_service': {
        const { error } = await supabase.from('leads').select('id').limit(1);
        return { ok: !error, error: error?.message };
      }

      case 'brightdata': {
        // Test proxy by making a request through Bright Data
        const res = await fetch('https://geo.brdtest.com/mygeo.json', {
          headers: {
            'Proxy-Authorization': 'Basic ' + Buffer.from(
              `${process.env.BRIGHTDATA_USERNAME}:${process.env.BRIGHTDATA_PASSWORD}`
            ).toString('base64'),
          },
        }).catch(() => null);
        return { ok: res?.ok ?? false, error: res?.ok ? undefined : 'Proxy connection failed' };
      }

      default:
        return { ok: false, error: `No test implemented for ${service}` };
    }
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
