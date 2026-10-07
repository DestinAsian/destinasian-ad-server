// An unchanged datetime-local value must never be sent without its timezone.
// Omitting it also preserves seconds/milliseconds from the persisted date.
export const buildCampaignUpdate = (form, initialStart, isEditing, initialEnd) => {
  const { startDate, endDate, ...fields } = form;
  const payload = { ...fields };
  if (!isEditing || endDate !== initialEnd) payload.endDate = new Date(endDate).toISOString();
  if (!isEditing || startDate !== initialStart) {
    payload.startDate = new Date(startDate).toISOString();
  }
  return payload;
};

export const reconcileAssignmentDraft = (rows, draft) =>
  Object.fromEntries(rows.map((row) => [
    row.adUnitId,
    [...(draft[row.adUnitId] ?? row.inventoryIds)],
  ]));

export const getDuplicateDateWindow = (source, now = new Date()) => {
  const startDate = new Date(now.getTime() + 5 * 60 * 1000);
  const sourceStart = new Date(source.startDate);
  const sourceEnd = new Date(source.endDate);
  const duration = Math.max(
    Number.isFinite(sourceEnd - sourceStart) ? sourceEnd - sourceStart : 0,
    24 * 60 * 60 * 1000,
  );
  return {
    startDate: startDate.toISOString(),
    endDate: (sourceEnd > startDate ? sourceEnd : new Date(+startDate + duration)).toISOString(),
  };
};
