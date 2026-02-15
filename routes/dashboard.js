const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { tenantIsolation } = require('../middleware/tenantIsolation');
const { getDashboardStats } = require('../controllers/statsController');

// @desc    Récupérer les statistiques du tableau de bord
// @route   GET /api/dashboard
// @access  Private (protégé et filtré par entreprise)
router.get('/', protect, tenantIsolation, getDashboardStats);

module.exports = router;
