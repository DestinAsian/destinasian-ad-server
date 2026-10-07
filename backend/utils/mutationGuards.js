const assertExpectedRevision = (document, value) => {
  if (value === undefined) return;
  const expected = new Date(value).getTime();
  if (!Number.isFinite(expected) || expected !== new Date(document.updatedAt).getTime()) {
    const error = new Error('This record changed since you opened it. Reopen the editor to review the latest data before saving.');
    error.statusCode = 409;
    throw error;
  }
};

const scopedRevisionFilter = (document, scope) => ({
  _id: document._id, ...scope,
  ...(document.updatedAt ? { updatedAt: document.updatedAt } : {}),
});

module.exports = { assertExpectedRevision, scopedRevisionFilter };
