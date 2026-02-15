const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadMiddleware } = require('../middleware/upload');
const { tenantIsolation } = require('../middleware/tenantIsolation');

const {
  getSites,
  getSite,
  createSite,
  updateSite,
  deleteSite,
  uploadPhotos,
  deletePhoto,
  uploadDocuments,
  deleteDocument,
  exportSites,
  getSitesStats
} = require('../controllers/siteController');

// --- Tenant Isolation (après auth pour avoir req.user) ---
router.use(protect);
router.use(tenantIsolation);

// --- Routes Spécifiques (Doivent être déclarées AVANT les routes avec :id) ---

// Statistiques
router.get('/stats', protect, getSitesStats);

// Export Excel
router.get('/export/excel', protect, exportSites);

// --- Routes Principales ---

router.route('/')
  .get(protect, getSites)
  .post(protect, createSite);

// --- Routes d'Upload (Photos & Documents) ---

// Photos
router.post('/:id/photos', protect, uploadMiddleware.sitePhotos, uploadPhotos);
router.delete('/:id/photos/:photoId', protect, deletePhoto);

// Documents
router.post('/:id/documents', protect, uploadMiddleware.siteDocuments, uploadDocuments);
router.delete('/:id/documents/:docId', protect, deleteDocument);

// --- Routes CRUD par ID (Doivent être à la fin pour ne pas intercepter les autres) ---

router.route('/:id')
  .get(protect, getSite)
  .put(protect, updateSite)
  .delete(protect, deleteSite);

module.exports = router;