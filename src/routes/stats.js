'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired } = require('../auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(authRequired);

router.get('/hazards', wrap(async (req, res) => {
  const stats = await store.getHazardStats();
  res.json({ data: stats });
}));

module.exports = router;
