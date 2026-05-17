// ─────────────────────────────────────────────────────────────
// HSM API — Shared Utilities
// Auth guard, response helpers, supabase client
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// Supabase service-role client (full DB access)
// ─────────────────────────────────────────────────────────────
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'placeholder-service-role-key',
);

// ─────────────────────────────────────────────────────────────
// Simple API key auth for admin panel
// Header: Authorization: Bearer <ADMIN_API_SECRET>
// ─────────────────────────────────────────────────────────────
export function requireAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get('authorization');
  const token      = authHeader?.replace('Bearer ', '').trim();
  const secret     = process.env.ADMIN_API_SECRET;

  if (!secret) {
    console.warn('[API] ADMIN_API_SECRET not set — all requests allowed (dev mode)');
    return null; // Allow in dev
  }

  if (!token || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null; // Auth passed
}

// ─────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────
export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function err(message: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function serverErr(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : 'Internal server error';
  console.error('[API] Server error:', message);
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

// ─────────────────────────────────────────────────────────────
// Parse pagination params from URL
// ─────────────────────────────────────────────────────────────
export function parsePagination(url: URL): { page: number; limit: number; offset: number } {
  const page  = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1'));
  const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50'));
  return { page, limit, offset: (page - 1) * limit };
}

// ─────────────────────────────────────────────────────────────
// CORS headers for admin panel (same-origin in production)
// ─────────────────────────────────────────────────────────────
export const corsHeaders = {
  'Access-Control-Allow-Origin':  process.env.ADMIN_PANEL_URL ?? '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function handleOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
