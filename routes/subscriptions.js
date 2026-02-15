const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { tenantIsolation } = require('../middleware/tenantIsolation');

router.get('/', protect, tenantIsolation, authorize('superadmin'), async (req, res) => {
  res.json({ message: 'Route subscriptions - À implémenter' });
});

module.exports = router;
