// Server-side proxy to the FastAPI service. API keys and the service URL never reach the browser.
import { NextRequest } from 'next/server';

const API = process.env.API_URL || 'http://localhost:8000';
const ALLOWED = new Set(['plan', 'explain', 'complete']);

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  if (!ALLOWED.has(path)) return new Response('Not found', { status: 404 });
  const body = await req.text();
  if (body.length > 400_000) return new Response('Request too large', { status: 413 });
  const res = await fetch(`${API}/ai/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: req.headers.get('authorization') || '', 'x-forwarded-for': req.ip || '' },
    body,
  });
  return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
}
