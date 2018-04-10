const nconf = require('nconf');

nconf
  .argv()
  .env()
  .file({ file: __dirname + '/../config.json' })
  .defaults({
    url: 'http://localhost:10002',
    port: 10002,
    secret: 'Super secret value',
  });

module.exports = nconf;
