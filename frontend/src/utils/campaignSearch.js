export const getCampaignIdsWithAdUnitSearchResults = (
  campaigns = [],
  searchQuery = "",
) => {
  if (!String(searchQuery).trim()) {
    return new Set();
  }

  return new Set(
    (Array.isArray(campaigns) ? campaigns : [])
      .filter(
        (campaign) =>
          Array.isArray(campaign?.adUnits) && campaign.adUnits.length > 0,
      )
      .map((campaign) => campaign._id)
      .filter(Boolean),
  );
};
