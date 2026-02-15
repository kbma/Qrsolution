const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getDashboardStats } = require('../controllers/statsController');

// Route pour le tableau de bord
// GET /api/stats/dashboard
router.get('/dashboard', protect, getDashboardStats);

module.exports = router;