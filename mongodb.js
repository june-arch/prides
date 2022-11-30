var mongoose = require('mongoose');
require('dotenv').config();

var db = process.env.DB || 'prides_test';
var url = process.env.DB_URL || 'localhost:27017,localhost:27018,localhost:27019';

var DB_ref = mongoose
  .createConnection('mongodb://' + url + '/' + db + '?replicaSet=rs')

  .on('error', function (err) {
    if (err) {
      console.error('Error connecting to MongoDB.', err.message);
      process.exit(1);
    }
  })
  .once('open', function callback() {
    console.info('Mongo db connected successfully ' + db);
  });

module.exports = DB_ref;
