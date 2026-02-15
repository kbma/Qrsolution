const express = require('express');
const router = express.Router();
const { protect, authorize, checkSubscription } = require('../middleware/auth');
const { tenantIsolation } = require('../middleware/tenantIsolation');
const { uploadMiddleware, handleMulterError } = require('../middleware/upload');
const {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientStats,
  uploadLogo,
  deleteLogo,
  archiveClient,
  resetClientAdminPassword
} = require('../controllers/clientController');

// Appliquer l'isolation multi-tenant - SuperAdmin uniquement pour les clients
router.use(protect);
router.use(tenantIsolation);

// Routes clients - SuperAdmin uniquement
router.route('/')
  .get(protect, authorize('superadmin'), getClients)
  .post(protect, authorize('superadmin'), createClient);

router.route('/:id')
  .get(protect, authorize('superadmin'), getClientById)
  .put(protect, authorize('superadmin'), uploadMiddleware.logo, handleMulterError, updateClient)
  .delete(protect, authorize('superadmin'), deleteClient);

// Actions spécifiques
router.put('/:id/archive', protect, authorize('superadmin'), archiveClient);
router.post('/:id/reset-admin-password', protect, authorize('superadmin'), resetClientAdminPassword);

// Logo du client
router.post('/:id/logo', 
  protect, 
  authorize('superadmin'), 
  uploadMiddleware.logo,
  handleMulterError,
  uploadLogo
);

router.delete('/:id/logo', 
  protect, 
  authorize('superadmin'), 
  deleteLogo
);

// Statistiques
router.get('/stats/summary', protect, authorize('superadmin'), getClientStats);

module.exports = router;
