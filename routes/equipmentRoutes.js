const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadMiddleware } = require('../middleware/upload');
const { tenantIsolation } = require('../middleware/tenantIsolation');

const {
  getEquipment,
  getEquipmentById,
  getEquipmentByQR,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  uploadDocuments,
  uploadImages,
  uploadMedia,
  deleteDocument,
  deleteImage,
  setMainImage,
  getHistorique,
  addHistoriqueEntry,
  getFichesIntervention,
  exportPDF,
  exportExcel,
  getEquipmentStats
} = require('../controllers/equipmentController');

// --- Tenant Isolation (après auth) ---
router.use(protect);
router.use(tenantIsolation);

// --- Routes Spécifiques (AVANT /:id) ---
router.get('/stats', protect, getEquipmentStats);
router.get('/export/excel', protect, exportExcel);
router.get('/qr/:code', protect, getEquipmentByQR);

// --- Routes Principales ---
router.route('/')
  .get(protect, getEquipment)
  // equipmentFull gère 'images' et 'documents' en même temps
  .post(protect, uploadMiddleware.equipmentFull, createEquipment);

// --- Routes Upload & Médias ---
router.post('/:id/documents', protect, uploadMiddleware.equipmentDocs, uploadDocuments);
router.post('/:id/images', protect, uploadMiddleware.equipmentImages, uploadImages);
router.post('/:id/media', protect, uploadMiddleware.equipmentFull, uploadMedia);

router.delete('/:equipmentId/documents/:docId', protect, deleteDocument);
router.delete('/:equipmentId/images/:imgId', protect, deleteImage);
router.put('/:id/images/:imageId/main', protect, setMainImage);

// --- Routes Historique & Fiches ---
router.route('/:id/historique')
  .get(protect, getHistorique)
  .post(protect, addHistoriqueEntry);

router.get('/:id/fiches-intervention', protect, getFichesIntervention);

// --- Export PDF ---
router.get('/:id/export/pdf', protect, exportPDF);

// --- Routes CRUD par ID ---
router.route('/:id')
  .get(protect, getEquipmentById)
  .put(protect, updateEquipment)
  .delete(protect, deleteEquipment);

module.exports = router;