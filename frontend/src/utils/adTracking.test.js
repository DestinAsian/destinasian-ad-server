import { createVisibilityTracker } from './adTracking';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

test('records an impression once when visibility reaches fifty percent', async () => {
  let intersectionCallback = null;
  let trackedCount = 0;

  const element = { id: 'slot-1' };
  const tracker = createVisibilityTracker({
    element,
    onVisible: async () => {
      trackedCount += 1;
    },
    observerFactory: (callback) => {
      intersectionCallback = callback;
      return {
        observe() {},
        unobserve() {},
        disconnect() {}
      };
    }
  });

  tracker.start();

  intersectionCallback([
    {
      target: element,
      isIntersecting: true,
      intersectionRatio: 0.49
    }
  ]);

  await flushPromises();
  expect(trackedCount).toBe(0);

  intersectionCallback([
    {
      target: element,
      isIntersecting: true,
      intersectionRatio: 0.5
    }
  ]);

  await flushPromises();
  expect(trackedCount).toBe(1);
});

test('duplicate visible events do not record duplicate impressions', async () => {
  let intersectionCallback = null;
  let trackedCount = 0;

  const element = { id: 'slot-2' };
  const tracker = createVisibilityTracker({
    element,
    onVisible: async () => {
      trackedCount += 1;
    },
    observerFactory: (callback) => {
      intersectionCallback = callback;
      return {
        observe() {},
        unobserve() {},
        disconnect() {}
      };
    }
  });

  tracker.start();

  intersectionCallback([
    {
      target: element,
      isIntersecting: true,
      intersectionRatio: 0.8
    }
  ]);

  intersectionCallback([
    {
      target: element,
      isIntersecting: true,
      intersectionRatio: 1
    }
  ]);

  await flushPromises();
  expect(trackedCount).toBe(1);
  expect(tracker.hasTracked()).toBe(true);
});
