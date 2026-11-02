// Regression check for the Block 99C Lorong 2 Toa Payoh bug (id 1220): the live API reported
// status ERROR, but the stale bundled seed (FULL / 100% from an old sensor reading) rewrote it,
// and the next telemetry refresh then flipped the machine to "In Operation".
// Run: npm run check
import assert from 'node:assert/strict';
import { mergeWithRichSeed, applyTelemetryToRvm } from '../src/utils/statusMerge.mts';

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

// 4. applyTelemetryToRvm tests
// 4a. Sensor fill >= 100% on running machine flips status to FULL
const runningMachine = { ...liveBase, status: 'RUNNING', rawStatus: 'RUNNING' };
const fullTelemetry = [{ compartment_type: 'CAN PET', threshold_level: 100, last_updated: '2026-10-25T12:00:00.000Z' }];
const filled = applyTelemetryToRvm(runningMachine, fullTelemetry);
assert.equal(filled.status, 'FULL');
assert.equal(filled.binFillPct, 100);
assert.equal(filled.last_updated, '2026-10-25T12:00:00.000Z');

// 4b. Out of service machine stays ERROR even with sensor telemetry
const errorMachine = { ...liveBase, status: 'ERROR', rawStatus: 'ERROR' };
const erroredWithTelemetry = applyTelemetryToRvm(errorMachine, fullTelemetry);
assert.equal(erroredWithTelemetry.status, 'ERROR');
assert.equal(erroredWithTelemetry.rawStatus, 'ERROR');

// 4c. Machine with low fill (< 100%) becomes RUNNING
const lowTelemetry = [{ compartment_type: 'CAN PET', threshold_level: 40, last_updated: '2026-10-25T13:00:00.000Z' }];
const emptied = applyTelemetryToRvm(filled, lowTelemetry);
assert.equal(emptied.status, 'RUNNING');
assert.equal(emptied.binFillPct, 40);

console.log('status merge checks passed');
