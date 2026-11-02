import type { RVM, BinStatusItem } from '../types/rvm';

// Upstream service states: the machine is not usable, so telemetry must never talk over them
export const OUT_OF_SERVICE_STATUSES = [
  'OFFLINE',
  'CLEANING',
  'SUSPENDED',
  'MAINTENANCE',
  'ERROR',
  'UNKNOWN',
];

export function isOutOfService(status?: string | null): boolean {
  return OUT_OF_SERVICE_STATUSES.includes((status || '').trim().toUpperCase());
}

// Apply live sensor telemetry to an individual RVM
export function applyTelemetryToRvm(rvm: RVM, binItems: BinStatusItem[]): RVM {
  if (!Array.isArray(binItems) || binItems.length === 0) return rvm;

  const maxPct = Math.max(
    ...binItems.map((b) => (typeof b.threshold_level === 'number' ? b.threshold_level : 0))
  );

  const validTimestamps = binItems
    .map((b) => b.last_updated)
    .filter((t): t is string => Boolean(t && !isNaN(new Date(t).getTime())));
  validTimestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const freshestTime = validTimestamps[0] || null;

  const existingTimestamp =
    rvm.last_updated ||
    rvm.binStatusDetails?.find((b) => b.last_updated)?.last_updated;
  const newestTime = freshestTime || existingTimestamp;

  const outOfService = isOutOfService(rvm.rawStatus) || isOutOfService(rvm.status);
  const isFull = maxPct >= 100;

  // Never overwrite an out-of-service machine to RUNNING or FULL
  const nextStatus = outOfService ? rvm.status : isFull ? 'FULL' : 'RUNNING';
  const nextRawStatus = outOfService ? rvm.rawStatus : isFull ? 'FULL' : 'RUNNING';

  return {
    ...rvm,
    status: nextStatus,
    rawStatus: nextRawStatus,
    binStatusDetails: binItems,
    binFillPct: maxPct,
    last_updated: newestTime,
    updated_at: newestTime,
  };
}

// Merge incoming location items with enriched seed telemetry so full bins never get downgraded by summary lag
export function mergeWithRichSeed(liveItems: RVM[], seedItems: RVM[] = []): RVM[] {
  if (!Array.isArray(liveItems)) return [];
  const seedMap = new Map((seedItems || []).map((s) => [s.id, s]));

  return liveItems.map((live) => {
    const seed = seedMap.get(live.id);
    if (!seed) return live;

    // A live OFFLINE/ERROR/MAINTENANCE machine stays that way: stale seed fill telemetry used to
    // rewrite it to FULL and then to RUNNING (see Block 99C Lorong 2 Toa Payoh, id 1220)
    if (isOutOfService(live.status) || isOutOfService(live.rawStatus)) {
      return {
        ...seed,
        ...live,
        status: live.status,
        rawStatus: live.rawStatus,
        binStatusDetails: live.binStatusDetails || [],
        binFillPct: typeof live.binFillPct === 'number' ? live.binFillPct : null,
        last_updated: live.last_updated || seed.last_updated,
        updated_at: live.updated_at || seed.updated_at || seed.last_updated,
      };
    }

    const hasLiveTelemetry = Boolean(live.binStatusDetails && live.binStatusDetails.length > 0);
    const effectiveDetails = hasLiveTelemetry ? live.binStatusDetails : seed.binStatusDetails;
    const effectiveFillPct = typeof live.binFillPct === 'number' ? live.binFillPct : seed.binFillPct;
    const effectiveTimestamp =
      live.last_updated ||
      seed.last_updated ||
      seed.updated_at;

    // Upstream live status has highest priority if it explicitly reports FULL/OFFLINE/ERROR.
    // If upstream live status says RUNNING but sensor telemetry proves it is >= 100%, mark FULL.
    const isFull =
      (typeof effectiveFillPct === 'number' && effectiveFillPct >= 100) ||
      live.status === 'FULL' ||
      live.rawStatus === 'FULL' ||
      seed.status === 'FULL';

    const status = isFull ? 'FULL' : live.status;
    const rawStatus = isFull ? 'FULL' : live.rawStatus;

    return {
      ...seed,
      ...live,
      status,
      rawStatus,
      binStatusDetails: effectiveDetails,
      binFillPct: effectiveFillPct,
      last_updated: effectiveTimestamp,
      updated_at: effectiveTimestamp,
    };
  });
}
