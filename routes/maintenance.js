const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { uploadMiddleware, handleMulterError } = require('../middleware/upload');
const maintenanceController = require('../controllers/maintenanceController');
const { tenantIsolation } = require('../middleware/tenantIsolation');

// Routes protégées
router.use(protect);
router.use(tenantIsolation);

// ===== STATISTIQUES (AVANT :id) =====
router.get('/stats/overview', maintenanceController.getMaintenanceStats);

// ===== PLANIFICATION ET SUIVI =====

// GET - Récupérer toutes les maintenances avec filtres
router.get('/', maintenanceController.getAllMaintenance);

// GET - Récupérer une maintenance spécifique
router.get('/:id', maintenanceController.getMaintenanceById);

// POST - Créer une intervention de maintenance
router.post(
  '/',
  authorize('client', 'superadmin', 'mainteneur_interne'),
  maintenanceController.createMaintenance
);

// PUT - Modifier une intervention
router.put(
  '/:id',
  authorize('client', 'superadmin', 'mainteneur_interne'),
  maintenanceController.updateMaintenance
);

// PATCH - Changer le statut d'une intervention
router.patch(
  '/:id/status',
  authorize('client', 'superadmin', 'mainteneur_interne', 'technicien'),
  maintenanceController.updateMaintenanceStatus
);

// DELETE - Supprimer une intervention
router.delete(
  '/:id',
  authorize('client', 'superadmin'),
  maintenanceController.deleteMaintenance
);

// ===== AFFECTATION TECHNICIENS =====

// PATCH - Affecter un technicien
router.patch(
  '/:id/assign-technician',
  authorize('client', 'superadmin', 'mainteneur_interne'),
  maintenanceController.assignTechnician
);

// GET - Récupérer les maintenances d'un technicien
router.get('/technician/:technicianId', maintenanceController.getMaintenanceByTechnician);

// ===== RAPPORT ET DOCUMENTS =====

// POST - Upload rapport de maintenance
router.post(
  '/:id/report',
  authorize('client', 'superadmin', 'mainteneur_interne', 'technicien'),
  uploadMiddleware.maintenanceReports,
  handleMulterError,
  maintenanceController.uploadReport
);

// POST - Ajouter document
router.post(
  '/:id/documents',
  authorize('client', 'superadmin', 'mainteneur_interne', 'technicien'),
  uploadMiddleware.generic,
  handleMulterError,
  maintenanceController.addDocument
);

// ===== PIÈCES CHANGÉES =====

// POST - Ajouter une pièce changée
router.post(
  '/:id/parts',
  authorize('client', 'superadmin', 'mainteneur_interne', 'technicien'),
  maintenanceController.addPart
);

// DELETE - Supprimer une pièce
router.delete(
  '/:id/parts/:partId',
  authorize('client', 'superadmin', 'mainteneur_interne'),
  maintenanceController.removePart
);

// ===== EXPORT PAR INTERVENTION =====
router.get('/:id/export/pdf', maintenanceController.exportPDF);

module.exports = router;
