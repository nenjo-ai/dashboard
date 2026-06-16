import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Canonicalize the apex homepage: https://nenjo.ai/ -> https://nenjo.ai
 * (canonical tag uses the non-slash form).
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/' && request.url.endsWith('/')) {
    return NextResponse.redirect(request.url.replace(/\/$/, ''), 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/',
};