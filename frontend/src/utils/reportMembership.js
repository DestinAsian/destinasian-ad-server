// Current assignments may have changed since these statistics were recorded.
// Keep valid report rows with history, alongside currently assigned zero rows.
export const belongsToChannelReport = (entityId, currentlyAssigned, metrics) =>
  Boolean(currentlyAssigned || metrics.has(String(entityId)));
