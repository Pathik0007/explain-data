export async function GET() {
  const api = process.env.API_URL || 'http://localhost:8000';
  try {
    const r = await fetch(`${api}/health`, { cache: 'no-store' });
    return Response.json({ web: 'ok', api: r.ok ? await r.json() : 'down' });
  } catch {
    return Response.json({ web: 'ok', api: 'unreachable' }, { status: 503 });
  }
}
