import {
  getCampaignIdsWithAdUnitSearchResults,
  getCampaignTitleSearchRows,
} from "./campaignSearch";

test("marks campaigns with matching Ad Unit results for automatic expansion", () => {
  const expandedIds = getCampaignIdsWithAdUnitSearchResults(
    [
      {
        _id: "campaign-with-result",
        adUnits: [{ _id: "ad-unit-1", name: "Element Bali Ubud by Westin_PC" }],
      },
      {
        _id: "campaign-without-result",
        adUnits: [{ _id: "ad-unit-2", name: "Unrelated Banner" }],
      },
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

test("shows only an Ad Unit row when only its title matches", () => {
  const rows = getCampaignTitleSearchRows(
    {
      name: "Marriott International",
      adUnits: [
        { name: "Element Bali Ubud by Westin_PC" },
        { name: "The Ritz-Carlton, Bali_HC" },
      ],
    },
    "Element Bali Ubud by Westin_PC",
  );

  expect(rows.showCampaign).toBe(false);
  expect(rows.adUnits.map((adUnit) => adUnit.name)).toEqual([
    "Element Bali Ubud by Westin_PC",
  ]);
});

test("shows only a Campaign row when only its title matches", () => {
  const rows = getCampaignTitleSearchRows(
    {
      name: "Marriott International",
      adUnits: [{ name: "Element Bali Ubud by Westin_PC" }],
    },
    "Marriott International",
  );

  expect(rows.showCampaign).toBe(true);
  expect(rows.adUnits).toEqual([]);
});

test("shows Campaign and Ad Unit rows when both titles match", () => {
  const rows = getCampaignTitleSearchRows(
    {
      name: "Bali Campaign",
      adUnits: [
        { name: "Bali Banner" },
        { name: "Singapore Banner" },
      ],
    },
    "Bali",
  );

  expect(rows.showCampaign).toBe(true);
  expect(rows.adUnits.map((adUnit) => adUnit.name)).toEqual(["Bali Banner"]);
});
