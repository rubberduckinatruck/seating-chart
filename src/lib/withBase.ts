// src/lib/withBase.ts
export function withBase(p: string) {
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
  // simple join; avoids using new URL with a relative base
  return (base.endsWith('/') ? base : base + '/') + p.replace(/^\/+/, '')
}
