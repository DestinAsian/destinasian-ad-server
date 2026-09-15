const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('../backend/node_modules/mongoose');

const {
  runAtomicMutation,
  supportsTransactions
} = require('../backend/services/transactionService');

const originalClient = mongoose.connection.client;
const originalStartSession = mongoose.startSession;

test.afterEach(() => {
  mongoose.connection.client = originalClient;
  mongoose.startSession = originalStartSession;
});

test('standalone MongoDB uses the prevalidated fallback without opening a session', async () => {
  mongoose.connection.client = {
    topology: { description: { type: 'Single' } }
  };
  mongoose.startSession = async () => {
    throw new Error('Standalone fallback must not start a transaction');
  };

  assert.equal(supportsTransactions(), false);
  const result = await runAtomicMutation(async (session) => {
    assert.equal(session, null);
    return 'fallback-result';
  });

  assert.equal(result, 'fallback-result');
});

test('replica-set MongoDB commits work through one session and returns its result', async () => {
  const calls = [];
  const session = {
    async withTransaction(work) {
      calls.push('transaction:start');
      await work();
      calls.push('transaction:commit');
    },
    async endSession() {
      calls.push('session:end');
    }
  };

  mongoose.connection.client = {
    topology: { description: { type: 'ReplicaSetWithPrimary' } }
  };
  mongoose.startSession = async () => session;

  assert.equal(supportsTransactions(), true);
  const result = await runAtomicMutation(async (receivedSession) => {
    assert.equal(receivedSession, session);
    calls.push('work');
    return 'transaction-result';
  });

  assert.equal(result, 'transaction-result');
  assert.deepEqual(calls, [
    'transaction:start',
    'work',
    'transaction:commit',
    'session:end'
  ]);
});

test('transaction sessions are always closed when work fails', async () => {
  let ended = false;
  const expectedError = new Error('assignment failed');
  const session = {
    async withTransaction(work) {
      await work();
    },
    async endSession() {
      ended = true;
    }
  };

  mongoose.connection.client = {
    topology: { description: { type: 'Sharded' } }
  };
  mongoose.startSession = async () => session;

  await assert.rejects(
    runAtomicMutation(async () => {
      throw expectedError;
    }),
    expectedError
  );
  assert.equal(ended, true);
});
