module.exports = {
  models: require('./models'),
  seedData: require('./db/seed-data'),
  buildInitialDatabase: require('./db/build-initial-database').buildInitialDatabase,
  createInMemoryDatabase: require('./services/database.service').createInMemoryDatabase,
  ...require('./controllers'),
  ...require('./routes'),
  ...require('./server/create-native-server')
};
