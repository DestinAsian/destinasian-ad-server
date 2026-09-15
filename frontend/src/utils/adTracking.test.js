import { recordTrackedEvent } from './adTracking';

describe('recordTrackedEvent', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('sends the exact served inventory context', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await expect(recordTrackedEvent({
      apiBaseUrl: '/api',
      adCode: 'ad-123',
      eventType: 'impression',
      inventoryId: 'inventory-456',
      fetchImpl,
    })).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledWith('/api/tracking/ad-123/impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryId: 'inventory-456' }),
      keepalive: true,
    });
  });

  test.each([400, 409, 500])('returns false for HTTP %s', async (status) => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status });

    await expect(recordTrackedEvent({
      apiBaseUrl: '/api',
      adCode: 'ad-123',
      eventType: 'click',
      fetchImpl,
    })).resolves.toBe(false);
  });
});
