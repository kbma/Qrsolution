const express = require('express');
const router = express.Router();
const { protect, authorize, checkSubscription, checkLimit } = require('../middleware/auth');
const { tenantIsolation } = require('../middleware/tenantIsolation');
const { upload } = require('../middleware/upload');
const {
  getSites,
  getSite,
  createSite,
  updateSite,
  deleteSite,
  getSitesStats
} = require('../controllers/siteController');

// Middleware de protection (doit être en premier)
router.use(protect);

// Middleware d'isolation multi-tenant (après authentication)
router.use(tenantIsolation);

// Routes principales
router.route('/')
  .get(getSites)
  .post(authorize('client_admin', 'superadmin'), checkSubscription, checkLimit('sites'), createSite);

router.route('/:id')
  .get(getSite)
  .put(authorize('client_admin', 'responsable_affaires', 'superadmin'), updateSite)
  .delete(authorize('client_admin', 'superadmin'), deleteSite);

// Routes pour documents et images (à implémenter)
router.post('/:id/documents', upload.single('document'), async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Fonctionnalité à implémenter'
  });
});

router.post('/:id/images', upload.single('image'), async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Fonctionnalité à implémenter'
  });
});

// Statistiques
router.get('/stats/all', getSitesStats);

module.exports = router;
