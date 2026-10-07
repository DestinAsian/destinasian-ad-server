const mongoose = require('mongoose');

const TRANSACTION_TOPOLOGIES = new Set([
  'ReplicaSetWithPrimary',
  'Sharded'
]);

const supportsTransactions = () => {
  const topologyType = mongoose.connection?.client?.topology?.description?.type;
  return TRANSACTION_TOPOLOGIES.has(topologyType);
};

const applySession = (query, session) => (
  session && query && typeof query.session === 'function'
    ? query.session(session)
    : query
);

const runAtomicMutation = async (work, { requireTransaction = false } = {}) => {
  if (!supportsTransactions()) {
    if (requireTransaction) {
      const error = new Error('This operation requires MongoDB transaction support (replica set). No changes were saved. Contact the administrator.');
      error.statusCode = 503;
      error.code = 'TRANSACTIONS_REQUIRED';
      throw error;
    }
    // Only explicitly single-document or read-only work may use this path.
    return work(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  applySession,
  runAtomicMutation,
  supportsTransactions
};
