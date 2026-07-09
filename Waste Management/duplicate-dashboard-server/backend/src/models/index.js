const enums = require('./enums');
const base = require('./base');
const position = require('./position.model');
const applicant = require('./applicant.model');
const screening = require('./screening.model');
const filtration = require('./filtration.model');
const talent = require('./talent.model');
const support = require('./support.model');
const user = require('./user.model');
const message = require('./message.model');

const models = {
  ...enums,
  ...base,
  ...position,
  ...applicant,
  ...screening,
  ...filtration,
  ...talent,
  ...support,
  ...user,
  ...message
};

if (require.main === module) {
  console.log('HEYA backend model layer ready');
  console.log(Object.keys(models).sort().join('\n'));
}

module.exports = models;
