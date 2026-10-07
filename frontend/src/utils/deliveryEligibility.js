const withinWindow = (entity, now) => {
  if (!entity) return false;
  const start = new Date(entity.startDate).getTime();
  const end = entity.endDate ? new Date(entity.endDate).getTime() : Infinity;
  return Number.isFinite(start) && start <= now && end >= now;
};

export const isAdUnitRunning = (unit, now = Date.now()) =>
  unit?.status === 'active' && unit?.campaign?.status === 'active'
  && withinWindow(unit, now) && withinWindow(unit.campaign, now);
