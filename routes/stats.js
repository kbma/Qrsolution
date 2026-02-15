const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/statsController');
const { protect } = require('../middleware/auth');
const { tenantIsolation } = require('../middleware/tenantIsolation');

// @desc    Récupérer les statistiques du tableau de bord
// @route   GET /api/stats/dashboard
// @access  Private (protégé et filtré par entreprise)
router.get('/dashboard', protect, tenantIsolation, getDashboardStats);

module.exports = router;