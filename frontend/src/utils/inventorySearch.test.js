import {
  doesInventoryMatchSearch,
  filterCampaignEntriesForInventorySearch,
} from "./inventorySearch";

const campaignEntries = [
  {
    campaignId: "campaign-1",
    campaignName: "World Of Hyatt",
    adUnits: [
      { _id: "ad-unit-1", name: "World Of Hyatt_Ad" },
      { _id: "ad-unit-2", name: "Element Bali Ubud by Westin_PC" },
    ],
  },
];

test("matches an Ad Channel by its title even when no Ad Unit title matches", () => {
  expect(
    doesInventoryMatchSearch(
      { _id: "inventory-1", name: "Airline News" },
      campaignEntries,
      "airline news",
    ),
  ).toBe(true);
});

test("continues matching an Ad Channel through a linked Ad Unit title", () => {
  expect(
    doesInventoryMatchSearch(
      { _id: "inventory-1", name: "Indonesia" },
      campaignEntries,
      "Element Bali",
    ),
  ).toBe(true);
});

test("returns all linked rows when the Ad Channel title matches", () => {
  const filteredEntries = filterCampaignEntriesForInventorySearch(
    campaignEntries,
    "Airline News",
    "Airline News",
  );

  expect(filteredEntries).toEqual(campaignEntries);
});

test("returns only matching Ad Units when search matches an Ad Unit title", () => {
  const filteredEntries = filterCampaignEntriesForInventorySearch(
    campaignEntries,
    "Element Bali",
    "Indonesia",
  );

  expect(filteredEntries).toEqual([
    {
      campaignId: "campaign-1",
      campaignName: "World Of Hyatt",
      adUnits: [{ _id: "ad-unit-2", name: "Element Bali Ubud by Westin_PC" }],
    },
  ]);
});

test("does not match unrelated Ad Channel and Ad Unit titles", () => {
  expect(
    doesInventoryMatchSearch(
      { _id: "inventory-1", name: "Airline News" },
      campaignEntries,
      "Unrelated title",
    ),
  ).toBe(false);
});
