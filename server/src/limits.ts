import { config } from './config.js';
import { supabaseAdmin } from './supabase.js';
import type { UsageInfo } from '../../shared/report.js';

/** Simple FIFO semaphore so only N headless browsers run at once. */
class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];
  constructor(private max: number) {}

  async acquire(timeoutMs: number): Promise<boolean> {
    if (this.active < this.max) {
      this.active++;
      return true;
    }
    return new Promise<boolean>((resolve) => {
      const waiter = () => {
        clearTimeout(timer);
        this.active++;
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        resolve(false);
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  release() {
    this.active--;
    this.waiters.shift()?.();
  }
}

export const scanSlots = new Semaphore(config.maxConcurrentScans);

/** One scan at a time per user. */
const inFlight = new Set<string>();
export const userLock = {
  tryAcquire: (userId: string) => (inFlight.has(userId) ? false : (inFlight.add(userId), true)),
  release: (userId: string) => inFlight.delete(userId),
};

async function getProfile(userId: string, email?: string) {
  const db = supabaseAdmin();
  const { data } = await db.from('profiles').select('plan, scans_this_month, usage_month').eq('id', userId).maybeSingle();
  if (data) return data;
  // Profile missing (e.g. user created before the trigger existed): create it.
  const { data: created, error } = await db
    .from('profiles')
    .upsert({ id: userId, email })
    .select('plan, scans_this_month, usage_month')
    .single();
  if (error) throw error;
  return created;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

export async function getUsage(userId: string, email?: string): Promise<UsageInfo> {
  const p = await getProfile(userId, email);
  return {
    plan: p.plan,
    used: p.usage_month === currentMonth() ? p.scans_this_month : 0,
    limit: config.planLimits[p.plan] ?? config.planLimits.free,
  };
}

export async function consumeCredit(userId: string, email?: string): Promise<{ allowed: boolean; usage: UsageInfo }> {
  const p = await getProfile(userId, email);
  const limit = config.planLimits[p.plan] ?? config.planLimits.free;
  const { data, error } = await supabaseAdmin().rpc('consume_scan_credit', { p_user: userId, p_limit: limit });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: Boolean(row?.allowed), usage: { plan: p.plan, used: row?.used ?? 0, limit } };
}

export async function refundCredit(userId: string) {
  await supabaseAdmin().rpc('refund_scan_credit', { p_user: userId });
}
