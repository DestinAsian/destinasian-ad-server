const test = require('node:test');
const assert = require('node:assert/strict');

const { createImpressionTracker, getCreativeType, renderAdCreative, resolveApiBase } = require('../ad-client.js');

function createMockElement(tagName) {
  return {
    tagName: tagName.toUpperCase(),
    style: {},
    children: [],
    attributes: {},
    textContent: '',
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
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
