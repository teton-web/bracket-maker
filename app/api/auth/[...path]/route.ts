import { getAuth } from '@/lib/auth/server';
import type { NextRequest } from 'next/server';

type AuthHandlers = ReturnType<ReturnType<typeof getAuth>['handler']>;

function lazy(method: keyof AuthHandlers) {
  return (request: NextRequest, context: { params: Promise<{ path: string[] }> }) => {
    return getAuth().handler()[method](request, context);
  };
}

export const GET = lazy('GET');
export const POST = lazy('POST');
export const PUT = lazy('PUT');
export const PATCH = lazy('PATCH');
export const DELETE = lazy('DELETE');
