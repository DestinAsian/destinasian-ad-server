const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createImpressionTracker, getCreativeType, renderAdCreative, resolveApiBase } = require('../ad-client.js');
const adClientSource = fs.readFileSync(path.resolve(__dirname, '..', 'ad-client.js'), 'utf8');

function createMockElement(tagName) {
  return {
    tagName: tagName.toUpperCase(),
    style: {},
    children: [],
    attributes: {},
    dataset: {},
    id: '',
    textContent: '',
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    replaceChildren(...children) {
      this.children = children;
    }
  };
}

function createResponse({ status = 200, body = {}, jsonError = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 500 ? 'Internal Server Error' : '',
    async json() {
      if (jsonError) {
        throw jsonError;
      }
      return body;
    }
  };
}

function createClientHarness({
  dataset = {},
  readyState = 'loading',
  elements = [],
  fetchImpl = async () => createResponse()
} = {}) {
  const logs = {
    log: [],
    warn: [],
    error: []
  };
  const listeners = {};
  const script = {
    src: 'https://ads-staging.destinasian.com/ad-client.js',
    dataset
  };
  const elementsById = new Map(elements.filter((element) => element.id).map((element) => [element.id, element]));
  const document = {
    currentScript: script,
    readyState,
    addEventListener(type, callback) {
      listeners[type] = callback;
    },
    getElementsByTagName(tagName) {
      return tagName === 'script' ? [script] : [];
    },
    querySelectorAll() {
      return elements;
    },
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    createElement(tagName) {
      return createMockElement(tagName);
    }
  };
  const consoleMock = {
    log(...args) {
      logs.log.push(args.map(String).join(' '));
    },
    warn(...args) {
      logs.warn.push(args.map(String).join(' '));
    },
    error(...args) {
      logs.error.push(args.map(String).join(' '));
    }
  };
  const root = {
    document,
    location: {
      href: 'https://test.destinasian.com/article',
      origin: 'https://test.destinasian.com'
    },
    fetch: fetchImpl,
    open() {
      return null;
    }
  };
  const context = {
    window: root,
    globalThis: root,
    module: { exports: {} },
    console: consoleMock,
    URL,
    URLSearchParams,
    Array,
    Set,
    Promise
  };

  vm.runInNewContext(adClientSource, context, { filename: 'ad-client.js' });

  return {
    client: root.AdServer,
    listeners,
    logs
  };
}

function createAdSlot(id = 'ad-slot') {
  const slot = createMockElement('div');
  slot.id = id;
  slot.dataset.inventory = 'homepage';
  return slot;
}

function successfulAdResponse() {
  return createResponse({
    body: {
      adCode: 'ad-123',
      name: 'Test Ad',
      imageUrl: 'https://example.com/ad.jpg',
      clickUrl: 'https://example.com'
    }
  });
}

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

test('creative type selection prefers html then iframe then image', () => {
  assert.equal(getCreativeType({ htmlCreative: '<div>Ad</div>', iframeUrl: 'https://example.com/frame', imageUrl: 'https://example.com/image.jpg' }), 'html');
  assert.equal(getCreativeType({ iframeUrl: 'https://example.com/frame', imageUrl: 'https://example.com/image.jpg' }), 'iframe');
  assert.equal(getCreativeType({ imageUrl: 'https://example.com/image.jpg' }), 'image');
  assert.equal(getCreativeType({}), 'empty');
});

test('renderAdCreative renders consistent wrappers for image, html, and iframe creatives', () => {
  global.document = {
    createElement(tagName) {
      return createMockElement(tagName);
    }
  };

  const imageContainer = createMockElement('div');
  const imageRendered = renderAdCreative(imageContainer, {
    name: 'Image Ad',
    imageUrl: 'https://example.com/ad.jpg'
  });
  assert.equal(imageRendered.creativeType, 'image');
  assert.equal(imageContainer.children[0].tagName, 'DIV');
  assert.equal(imageContainer.children[0].children[0].tagName, 'IMG');

  const htmlContainer = createMockElement('div');
  const htmlRendered = renderAdCreative(htmlContainer, {
    name: 'HTML Ad',
    htmlCreative: '<a href="https://example.com">Click</a>'
  });
  assert.equal(htmlRendered.creativeType, 'html');
  assert.equal(htmlContainer.children[0].children[0].innerHTML, '<a href="https://example.com">Click</a>');

  const iframeContainer = createMockElement('div');
  const iframeRendered = renderAdCreative(iframeContainer, {
    name: 'Iframe Ad',
    iframeUrl: 'https://example.com/frame',
    clickUrl: 'https://example.com/landing'
  });
  assert.equal(iframeRendered.creativeType, 'iframe');
  assert.equal(iframeContainer.children[0].tagName, 'IFRAME');
  assert.equal(iframeContainer.children[1].tagName, 'BUTTON');

  delete global.document;
});

test('resolveApiBase prefers explicit window override', () => {
  const originalApiBase = global.AD_SERVER_API_BASE;
  global.AD_SERVER_API_BASE = 'https://ads.destinasian.com';

  assert.equal(resolveApiBase(), 'https://ads.destinasian.com/api');

  delete global.AD_SERVER_API_BASE;
  if (originalApiBase) {
    global.AD_SERVER_API_BASE = originalApiBase;
  }
});

test('resolveApiBase derives api origin from current ad-client script', () => {
  const originalDocument = global.document;
  const originalLocation = global.location;

  global.document = {
    currentScript: {
      src: 'https://ads.destinasian.com/ad-client.js',
      dataset: {}
    }
  };
  global.location = {
    href: 'https://test.destinasian.com/article'
  };

  assert.equal(resolveApiBase(), 'https://ads.destinasian.com/api');

  global.document = originalDocument;
  global.location = originalLocation;
});

test('debug=false hides successful ad, impression, and click logs', async () => {
  const slot = createAdSlot();
  const harness = createClientHarness({
    dataset: { debug: 'false' },
    elements: [slot],
    fetchImpl: async (url) => url.includes('/serve?') ? successfulAdResponse() : createResponse()
  });

  await harness.client.loadAd(slot.id);
  await new Promise((resolve) => setImmediate(resolve));
  await harness.client.recordClick('ad-123');

  assert.deepEqual(harness.logs.log, []);
  assert.equal(harness.logs.error.length, 0);
});

test('missing data-debug defaults to silent success logging', async () => {
  const harness = createClientHarness({
    fetchImpl: async () => createResponse()
  });

  await harness.client.recordImpression('ad-123');
  await harness.client.recordClick('ad-123');

  assert.deepEqual(harness.logs.log, []);
  assert.equal(harness.logs.error.length, 0);
});

test('debug=true allows successful ad, impression, and click logs', async () => {
  const slot = createAdSlot();
  const harness = createClientHarness({
    dataset: { debug: 'true' },
    elements: [slot],
    fetchImpl: async (url) => url.includes('/serve?') ? successfulAdResponse() : createResponse()
  });

  await harness.client.loadAd(slot.id);
  await new Promise((resolve) => setImmediate(resolve));
  await harness.client.recordClick('ad-123');

  assert.ok(harness.logs.log.some((message) => message.includes('Ad loaded: Test Ad')));
  assert.ok(harness.logs.log.some((message) => message.includes('Impression recorded: ad-123')));
  assert.ok(harness.logs.log.some((message) => message.includes('Click recorded: ad-123')));
  assert.equal(harness.logs.error.length, 0);
});

test('404 No active ad available is an expected silent state', async () => {
  const slot = createAdSlot();
  const harness = createClientHarness({
    elements: [slot],
    fetchImpl: async () => createResponse({ status: 404, body: { error: 'No active ad available' } })
  });

  await harness.client.loadAd(slot.id);

  assert.deepEqual(harness.logs.error, []);
});

test('legacy 404 Inventory not found is treated as an expected empty state', async () => {
  const slot = createAdSlot();
  const harness = createClientHarness({
    elements: [slot],
    fetchImpl: async () => createResponse({ status: 404, body: { error: 'Inventory not found' } })
  });

  await harness.client.loadAd(slot.id);

  assert.deepEqual(harness.logs.error, []);
});

test('204 no-content serve response is an expected silent state', async () => {
  const slot = createAdSlot();
  const harness = createClientHarness({
    elements: [slot],
    fetchImpl: async () => createResponse({ status: 204 })
  });

  await harness.client.loadAd(slot.id);

  assert.deepEqual(harness.logs.log, []);
  assert.deepEqual(harness.logs.error, []);
});

test('400 serve response remains a request error', async () => {
  const slot = createAdSlot();
  const harness = createClientHarness({
    elements: [slot],
    fetchImpl: async () => createResponse({ status: 400, body: { error: 'inventory or adCode is required' } })
  });

  await harness.client.loadAd(slot.id);

  assert.ok(harness.logs.error.some((message) => message.includes('Ad server response error (400)')));
  assert.equal(harness.logs.error.some((message) => message.includes('inventory or adCode is required')), false);
});

test('500 serve response remains a real error', async () => {
  const slot = createAdSlot();
  const harness = createClientHarness({
    elements: [slot],
    fetchImpl: async () => createResponse({ status: 500, body: { error: 'Database unavailable' } })
  });

  await harness.client.loadAd(slot.id);

  assert.ok(harness.logs.error.some((message) => message.includes('Ad server response error (500)')));
  assert.equal(harness.logs.error.some((message) => message.includes('Database unavailable')), false);
});

test('network failure remains a real error', async () => {
  const slot = createAdSlot();
  const harness = createClientHarness({
    elements: [slot],
    fetchImpl: async () => {
      throw new Error('Network unavailable');
    }
  });

  await harness.client.loadAd(slot.id);

  assert.ok(harness.logs.error.some((message) => message.includes('Error loading ad')));
  assert.equal(harness.logs.error.some((message) => message.includes('Network unavailable')), false);
});

test('malformed serve response remains a real error', async () => {
  const slot = createAdSlot();
  const harness = createClientHarness({
    elements: [slot],
    fetchImpl: async () => createResponse({ jsonError: new Error('Invalid JSON') })
  });

  await harness.client.loadAd(slot.id);

  assert.ok(harness.logs.error.some((message) => message.includes('Malformed ad server response')));
});

test('impression and click non-2xx responses are not logged as success', async () => {
  const harness = createClientHarness({
    dataset: { debug: 'true' },
    fetchImpl: async () => createResponse({ status: 500, body: { error: 'Tracking unavailable' } })
  });

  await harness.client.recordImpression('ad-123');
  await harness.client.recordClick('ad-123');

  assert.ok(harness.logs.error.some((message) => message.includes('Impression tracking failed (500)')));
  assert.ok(harness.logs.error.some((message) => message.includes('Click tracking failed (500)')));
  assert.equal(harness.logs.log.some((message) => message.includes('recorded')), false);
});

test('debug=true includes diagnostic details for unexpected failures', async () => {
  const slot = createAdSlot();
  const harness = createClientHarness({
    dataset: { debug: 'true' },
    elements: [slot],
    fetchImpl: async () => createResponse({ status: 500, body: { error: 'Database unavailable' } })
  });

  await harness.client.loadAd(slot.id);

  assert.ok(harness.logs.error.some((message) => message.includes('Database unavailable')));
});

test('data-auto-load=false prevents automatic loading', async () => {
  let fetchCount = 0;
  const slot = createAdSlot();
  createClientHarness({
    dataset: { autoLoad: 'false' },
    readyState: 'complete',
    elements: [slot],
    fetchImpl: async () => {
      fetchCount += 1;
      return createResponse({ status: 404, body: { error: 'No active ad available' } });
    }
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCount, 0);
});

test('automatic loading remains enabled by default', async () => {
  let fetchCount = 0;
  const slot = createAdSlot();
  createClientHarness({
    readyState: 'complete',
    elements: [slot],
    fetchImpl: async () => {
      fetchCount += 1;
      return createResponse({ status: 404, body: { error: 'No active ad available' } });
    }
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCount, 1);
});
