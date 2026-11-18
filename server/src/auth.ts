import type { NextFunction, Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Requires `Authorization: Bearer <supabase access token>`.
 * The token is verified by Supabase Auth, so expired/forged tokens are rejected.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
      return;
    }
    req.user = data.user;
    next();
  } catch (err) {
    console.error('[auth] verification failed', err);
    res.status(503).json({ error: 'Authentication service unavailable. Is Supabase running?' });
  }
}
