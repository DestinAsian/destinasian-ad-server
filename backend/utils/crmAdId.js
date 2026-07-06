const CRM_AD_ID_PATTERN = /^\d{11}$/;
const SOURCE_CODES = {
  DESTINASIAN: '01',
  DESTINASIAN_INDONESIA: '02'
};

const padCode = (value, length, label) => {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue < 1) {
    throw new Error(`${label} code is required`);
  }

  const padded = String(numericValue).padStart(length, '0');
  if (padded.length !== length) {
    throw new Error(`${label} code must fit ${length} digits`);
  }

  return padded;
};

const normalizeSourceCode = (value) => {
  const normalized = String(value || '').trim();
  if (normalized === SOURCE_CODES.DESTINASIAN || normalized === SOURCE_CODES.DESTINASIAN_INDONESIA) {
    return normalized;
  }
  return null;
};

const inferSourceCodeFromAccount = (account) => {
  const explicitCode = normalizeSourceCode(account?.sourceCode);
  if (explicitCode) return explicitCode;

  const accountName = String(account?.name || '').toLowerCase();
  if (accountName.includes('indonesia')) {
    return SOURCE_CODES.DESTINASIAN_INDONESIA;
  }

  return SOURCE_CODES.DESTINASIAN;
};

const formatCrmAdId = ({ sourceCode, inventoryCode, campaignCode, adUnitCode }) => {
  const finalSourceCode = normalizeSourceCode(sourceCode);
  if (!finalSourceCode) {
    throw new Error('Dashboard source code must be 01 or 02');
  }

  const crmAdId = [
    finalSourceCode,
    padCode(inventoryCode, 3, 'Inventory'),
    padCode(campaignCode, 4, 'Campaign'),
    padCode(adUnitCode, 2, 'Ad Unit')
  ].join('');

  if (!CRM_AD_ID_PATTERN.test(crmAdId)) {
    throw new Error('CRM AD ID must be exactly 11 digits');
  }

  return crmAdId;
};

module.exports = {
  CRM_AD_ID_PATTERN,
  SOURCE_CODES,
  formatCrmAdId,
  inferSourceCodeFromAccount,
  normalizeSourceCode,
  padCode
};
