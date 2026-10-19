const STAGING_DASHBOARD_ORIGIN = 'https://admin-staging.destinasian.com';
const DA_TESTING_ORIGIN = 'https://test.destinasian.com';
const DA_STAGING_ACCOUNT_ID = '69b93d4c08ec4bf1fc9d0245';

const isStagingDashboard = (dashboardUrl) => {
  try {
    return new URL(dashboardUrl).origin === STAGING_DASHBOARD_ORIGIN;
  } catch {
    return false;
  }
};

const getLegacyServingAccountId = ({ inventory, inventoryId, accountId, adCode, origin } = {}, environment = process.env) => {
  // Explicit integrations keep their exact identifiers, including invalid ones
  // which must still be rejected by the inventory resolver.
  if (!inventory || accountId !== undefined || inventoryId !== undefined || adCode !== undefined) {
    return accountId;
  }
  // DA's existing SDK tags predate multi-account inventory names. Route only
  // those public staging requests to DA; never pick an arbitrary matching key.
  if (isStagingDashboard(environment.DASHBOARD_URL) && origin === DA_TESTING_ORIGIN) {
    return DA_STAGING_ACCOUNT_ID;
  }
  return accountId;
};

module.exports = { isStagingDashboard, getLegacyServingAccountId };
