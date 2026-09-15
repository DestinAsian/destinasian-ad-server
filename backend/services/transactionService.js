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

const runAtomicMutation = async (work) => {
  if (!supportsTransactions()) {
    // Standalone MongoDB does not support multi-document transactions. Callers
    // still pre-validate the complete plan and use one bulk write per model.
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
