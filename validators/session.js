const Joi = require('joi');

const create = Joi.object({
  data: Joi.object().required(),
});

module.exports = {
  create,
};
