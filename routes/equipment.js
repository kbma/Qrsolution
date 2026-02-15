const express = require('express');
const router = express.Router();
const { protect, authorize, checkSubscription, checkLimit } = require('../middleware/auth');
const { uploadMiddleware, handleMulterError } = require('../middleware/upload');
const {
  getEquipment,
  getEquipmentById,
  getEquipmentByQR,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  uploadImages,
  uploadDocuments,
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

// ===== ROUTES SPÉCIALES (AVANT LES ROUTES AVEC :id) =====

// Routes publiques
router.get('/qr/:code', getEquipmentByQR);
router.get('/qr/generate', protect, async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ message: 'Le nom de l\'équipement est requis' });
    }
    
    // Generate QR code using the qrcode utility
    const qrcode = require('../utils/qrcode');
    const result = await qrcode.generateQRCode(name);
    
    res.json({
      success: true,
      code: result.code,
      qrCodeUrl: result.qrCodeUrl
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la génération du QR code', error: error.message });
  }
});

// ===== STATISTIQUES ET EXPORT (AVANT :id) =====
router.get('/stats/overview', protect, getEquipmentStats);
router.get('/export/excel', protect, exportExcel);

// ===== UPLOAD DOCUMENTS ET IMAGES (AVANT :id POUR ÉVITER INTERCEPTION) =====
router.post('/:id/images',
  protect,
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  uploadMiddleware.equipmentImages,
  handleMulterError,
  uploadImages
);

router.post('/:id/documents',
  protect,
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  uploadMiddleware.equipmentDocs,
  handleMulterError,
  uploadDocuments
);

// ===== ROUTES PRINCIPALES =====

// GET list & POST create
router.get('/', protect, getEquipment);
router.post('/',
  protect,
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  checkSubscription,
  checkLimit('equipements'),
  uploadMiddleware.equipmentFull,
  handleMulterError,
  createEquipment
);

// ===== ROUTES AVEC :id (APRÈS LES ROUTES SPÉCIALES) =====

// GET, PUT, DELETE spécifique équipement
router.get('/:id', protect, getEquipmentById);
router.put('/:id',
  protect,
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  updateEquipment
);
router.delete('/:id',
  protect,
  authorize('client', 'client_admin', 'superadmin'),
  deleteEquipment
);

// ===== GESTION DOCUMENTS =====
router.delete('/:id/documents/:docId',
  protect,
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  deleteDocument
);

router.delete('/:id/images/:imageId',
  protect,
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  deleteImage
);

router.put('/:id/images/:imageId/main',
  protect,
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  setMainImage
);

// ===== HISTORIQUE =====
router.get('/:id/historique', protect, getHistorique);

router.post('/:id/historique',
  protect,
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne', 'technicien'),
  addHistoriqueEntry
);

// ===== FICHES D'INTERVENTION =====
router.get('/:id/fiches', protect, getFichesIntervention);

// ===== EXPORT PAR ÉQUIPEMENT =====
router.get('/:id/export/pdf', protect, exportPDF);

module.exports = router;
