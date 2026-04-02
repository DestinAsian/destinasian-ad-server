const test = require('node:test');
const assert = require('node:assert/strict');

const { createImpressionTracker } = require('../ad-client.js');

test('impression fires once when visibility reaches at least 50 percent', async () => {
  const observedTargets = [];
  let intersectionCallback = null;
  let trackedCount = 0;

  const container = { id: 'slot-1' };
  const tracker = createImpressionTracker({
    container,
    adCode: 'ad-123',
    recordImpressionFn: async () => {
      trackedCount += 1;
    },
    observerFactory: (callback) => {
      intersectionCallback = callback;
      return {
        observe(target) {
          observedTargets.push(target);
        },
        unobserve(target) {
          observedTargets.push({ unobserved: target });
        }
      };
    }
  });

  tracker.start();
  assert.equal(observedTargets[0], container);

  intersectionCallback([
    {
      target: container,
      isIntersecting: true,
      intersectionRatio: 0.49
    }
  ]);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(trackedCount, 0);

  intersectionCallback([
    {
      target: container,
      isIntersecting: true,
      intersectionRatio: 0.5
    }
  ]);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(trackedCount, 1);
});

test('duplicate visible events do not create duplicate impressions', async () => {
  let intersectionCallback = null;
  let trackedCount = 0;

  const container = { id: 'slot-2' };
  const tracker = createImpressionTracker({
    container,
    adCode: 'ad-456',
    recordImpressionFn: async () => {
      trackedCount += 1;
    },
    observerFactory: (callback) => {
      intersectionCallback = callback;
      return {
        observe() {},
        unobserve() {}
      };
    }
  });

  tracker.start();

  intersectionCallback([
    {
      target: container,
      isIntersecting: true,
      intersectionRatio: 0.75
    }
  ]);

  intersectionCallback([
    {
      target: container,
      isIntersecting: true,
      intersectionRatio: 1
    }
  ]);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(trackedCount, 1);
  assert.equal(tracker.hasTracked(), true);
});
