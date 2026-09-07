export const getCampaignIdsWithAdUnitSearchResults = (
  campaigns = [],
  searchQuery = "",
) => {
  if (!String(searchQuery).trim()) {
    return new Set();
  }

  const normalizedSearch = String(searchQuery).trim().toLowerCase();

  return new Set(
    (Array.isArray(campaigns) ? campaigns : [])
      .filter(
        (campaign) =>
          Array.isArray(campaign?.adUnits) &&
          campaign.adUnits.some((adUnit) =>
            String(adUnit?.name || "")
              .toLowerCase()
              .includes(normalizedSearch),
          ),
      )
      .map((campaign) => campaign._id)
      .filter(Boolean),
  );
};

const titleIncludes = (title, searchQuery) =>
  String(title || "")
    .toLowerCase()
    .includes(String(searchQuery || "").trim().toLowerCase());

export const getCampaignTitleSearchRows = (
  campaign = {},
  searchQuery = "",
) => {
  const normalizedSearch = String(searchQuery || "").trim();
  const adUnits = Array.isArray(campaign?.adUnits) ? campaign.adUnits : [];

  if (!normalizedSearch) {
    return {
      showCampaign: true,
      adUnits,
    };
  }

  return {
    showCampaign: titleIncludes(campaign?.name, normalizedSearch),
    adUnits: adUnits.filter((adUnit) =>
      titleIncludes(adUnit?.name, normalizedSearch),
    ),
  };
};
