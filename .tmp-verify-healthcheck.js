// Temporary verification: healthcheck command before/after the YAML rewrite.
const yaml = require('js-yaml');
const fs = require('fs');

const expected =
  'mongosh --quiet --username "$$MONGO_INITDB_ROOT_USERNAME" --password "$$MONGO_INITDB_ROOT_PASSWORD"' +
  ' --authenticationDatabase admin --eval \'db.adminCommand("ping").ok\' | grep -q 1';

const doc = yaml.load(fs.readFileSync('docker-compose.yml', 'utf8'), { schema: yaml.JSON_SCHEMA });
const actual = doc.services.mongodb.healthcheck.test[1];

console.log('MATCH:', actual === expected);
if (actual !== expected) {
  console.log('EXPECTED:', JSON.stringify(expected));
  console.log('ACTUAL  :', JSON.stringify(actual));
  process.exit(1);
}
