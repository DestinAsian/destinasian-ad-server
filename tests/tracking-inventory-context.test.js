const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('../backend/node_modules/mongoose');

const { resolveTrackingInventoryId } = require('../backend/controllers/trackingController');

test('tracking uses the channel that actually served the ad', () => {
  const primary = new mongoose.Types.ObjectId();
  const served = new mongoose.Types.ObjectId();
  const result = resolveTrackingInventoryId(
    { inventory: primary, inventories: [primary, served] },
    String(served)
  );

  assert.equal(String(result), String(served));
});

test('legacy tracking requests retain the explicit primary-channel fallback', () => {
  const primary = new mongoose.Types.ObjectId();
  const secondary = new mongoose.Types.ObjectId();
  const result = resolveTrackingInventoryId(
    { inventory: primary, inventories: [secondary, primary] },
    undefined
  );

  assert.equal(String(result), String(primary));
});

test('tracking rejects a channel that is not assigned to the ad unit', () => {
  const assigned = new mongoose.Types.ObjectId();
  const unrelated = new mongoose.Types.ObjectId();

  assert.throws(
    () => resolveTrackingInventoryId(
      { inventory: assigned, inventories: [assigned] },
      String(unrelated)
    ),
    (error) => error.statusCode === 400 && /not assigned/i.test(error.message)
  );
});
