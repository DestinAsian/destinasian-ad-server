const pickFields = (payload = {}, allowed = []) => Object.fromEntries(
  allowed.filter((field) => Object.prototype.hasOwnProperty.call(payload, field))
    .map((field) => [field, payload[field]])
);

const campaignUpdateFields = ['name', 'description', 'startDate', 'endDate', 'status'];
const adUnitUpdateFields = [
  'name', 'description', 'campaign', 'startDate', 'endDate', 'status',
  'imageUrl', 'htmlCreative', 'iframeUrl', 'clickUrl', 'width', 'aspectRatio',
];

const duplicateKeyMessage = (error, entity) => {
  const fields = Object.keys(error.keyPattern || error.keyValue || {});
  const indexDetail = String(error.message || '');
  if (fields.includes('crmAdId') || fields.includes('adUnitCode') || fields.includes('campaignCode')
    || fields.includes('inventoryCode') || /crmAdId|adUnitCode|campaignCode|inventoryCode/.test(indexDetail)) {
    return 'An assignment identifier conflicts with existing data. Refresh and retry; if it persists, contact the administrator.';
  }
  if (fields.includes('name') || fields.includes('key') || /(?:name|key)_1/.test(indexDetail)) {
    return entity === 'Campaign' ? 'Campaign name already exists' : 'Ad Channel name or key already exists';
  }
  return 'The update conflicts with an existing record. Refresh and retry.';
};

module.exports = { pickFields, campaignUpdateFields, adUnitUpdateFields, duplicateKeyMessage };
