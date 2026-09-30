// Converts SPSS / Stata / SAS / Parquet / Feather files to CSV via the Python service.
import { NextRequest } from 'next/server';

const API = process.env.API_URL || 'http://localhost:8000';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const res = await fetch(`${API}/convert`, { method: 'POST', body: form });
  return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'text/plain' } });
}
