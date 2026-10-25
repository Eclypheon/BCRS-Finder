// Regression check for the Block 99C Lorong 2 Toa Payoh bug (id 1220): the live API reported
// status ERROR, but the stale bundled seed (FULL / 100% from an old sensor reading) rewrote it,
// and the next telemetry refresh then flipped the machine to "In Operation".
// Run: npm run check
import assert from 'node:assert/strict';
import { mergeWithRichSeed } from '../src/utils/statusMerge.mts';

const liveBase = {
  id: 1220,
  serialNumber: 'B5052491',
  locationName: 'Block 99C Lorong 2 Toa Payoh',
  address: '99C Lorong 2 Toa Payoh, 312099',
  postalCode: '312099',
  latitude: 1.339046,
  longitude: 103.847473,
};

const staleSeed = {
  ...liveBase,
  status: 'FULL',
  rawStatus: 'FULL',
  binFillPct: 100,
  binStatusDetails: [{ compartment_type: 'CAN PET', threshold_level: 100, last_updated: '2026-10-14T11:27:16.000Z' }],
  last_updated: '2026-10-14T11:27:16.000Z',
};

// 1. Upstream ERROR must survive stale seed telemetry
const [errored] = mergeWithRichSeed(
  [{ ...liveBase, status: 'ERROR', rawStatus: 'ERROR' }],
  [staleSeed]
);
assert.equal(errored.status, 'ERROR');
assert.equal(errored.rawStatus, 'ERROR');
assert.equal(errored.binFillPct, null, 'stale seed fill must not survive an out-of-service machine');

// 2. Without a seed match the live record passes through untouched
const [passthrough] = mergeWithRichSeed([{ ...liveBase, status: 'RUNNING', rawStatus: 'RUNNING' }], []);
assert.equal(passthrough.status, 'RUNNING');

// 3. A running machine keeps its enriched seed telemetry when the live summary has none
const [enriched] = mergeWithRichSeed(
  [{ ...liveBase, status: 'RUNNING', rawStatus: 'RUNNING' }],
  [{ ...staleSeed, status: 'RUNNING', rawStatus: 'RUNNING' }]
);
assert.equal(enriched.status, 'FULL', 'seed 100% still marks a running machine full');
assert.equal(enriched.binFillPct, 100);

console.log('status merge checks passed');
