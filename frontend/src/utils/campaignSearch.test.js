import { getCampaignIdsWithAdUnitSearchResults } from "./campaignSearch";

test("marks campaigns with matching Ad Unit results for automatic expansion", () => {
  const expandedIds = getCampaignIdsWithAdUnitSearchResults(
    [
      {
        _id: "campaign-with-result",
        adUnits: [{ _id: "ad-unit-1", name: "Element Bali Ubud by Westin_PC" }],
      },
      { _id: "campaign-without-result", adUnits: [] },
    ],
    "Element Bali Ubud by Westin_PC",
  );

  expect([...expandedIds]).toEqual(["campaign-with-result"]);
});

test("does not force campaigns open when search is empty", () => {
  const expandedIds = getCampaignIdsWithAdUnitSearchResults(
    [{ _id: "campaign-1", adUnits: [{ _id: "ad-unit-1" }] }],
    "   ",
  );

  expect(expandedIds.size).toBe(0);
});
