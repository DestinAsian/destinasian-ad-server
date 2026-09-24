const normalizeSearch = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const titleIncludes = (title, normalizedSearch) =>
  String(title || "").toLowerCase().includes(normalizedSearch);

const hasMatchingAdUnit = (campaignEntries, normalizedSearch) =>
  (Array.isArray(campaignEntries) ? campaignEntries : []).some(
    (campaignEntry) =>
      (Array.isArray(campaignEntry?.adUnits)
        ? campaignEntry.adUnits
        : []
      ).some((adUnit) => titleIncludes(adUnit?.name, normalizedSearch)),
  );

export const doesInventoryMatchSearch = (
  inventory = {},
  campaignEntries = [],
  searchQuery = "",
) => {
  const normalizedSearch = normalizeSearch(searchQuery);
  if (!normalizedSearch) return true;

  return (
    titleIncludes(inventory?.name, normalizedSearch) ||
    hasMatchingAdUnit(campaignEntries, normalizedSearch)
  );
};

export const filterCampaignEntriesForInventorySearch = (
  campaignEntries = [],
  searchQuery = "",
  inventoryName = "",
) => {
  const normalizedSearch = normalizeSearch(searchQuery);
  if (
    !normalizedSearch ||
    titleIncludes(inventoryName, normalizedSearch)
  ) {
    return campaignEntries;
  }

  return campaignEntries
    .map((campaignEntry) => ({
      ...campaignEntry,
      adUnits: (Array.isArray(campaignEntry?.adUnits)
        ? campaignEntry.adUnits
        : []
      ).filter((adUnit) => titleIncludes(adUnit?.name, normalizedSearch)),
    }))
    .filter((campaignEntry) => campaignEntry.adUnits.length > 0);
};
