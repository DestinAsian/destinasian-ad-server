const mongoose = require('mongoose');

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/ad-server';

const getMongoUri = () => (
  process.env.MONGO_URI
  || process.env.MONGODB_URI
  || DEFAULT_MONGO_URI
);

const connectDatabase = async () => {
  const uri = getMongoUri();

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000)
  });

  return mongoose.connection;
};

module.exports = {
  DEFAULT_MONGO_URI,
  connectDatabase,
  getMongoUri
};
