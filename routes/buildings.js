const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const buildingController = require('../controllers/buildingController');
const { tenantIsolation } = require('../middleware/tenantIsolation');

// Routes protégées
router.use(protect);
router.use(tenantIsolation);

// GET - Récupérer tous les bâtiments d'un site
router.get('/site/:siteId', buildingController.getBuildingsBySite);

// GET - Récupérer un bâtiment spécifique
router.get('/:id', buildingController.getBuildingById);

// POST - Créer un bâtiment
router.post(
  '/',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  buildingController.createBuilding
);

// PUT - Modifier un bâtiment
router.put(
  '/:id',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  buildingController.updateBuilding
);

// DELETE - Supprimer un bâtiment
router.delete(
  '/:id',
  authorize('client', 'client_admin', 'superadmin'),
  buildingController.deleteBuilding
);

// POST - Générer code sécurité avec validation périodique
router.post(
  '/:id/generate-security-code',
  authorize('client', 'client_admin', 'superadmin'),
  buildingController.generateSecurityCode
);

// GET - Récupérer les codes de sécurité d'un bâtiment
router.get(
  '/:id/security-codes',
  buildingController.getSecurityCodes
);

// PUT - Incrémenter utilisation d'un code de sécurité
router.put(
  '/:id/security-code/use',
  buildingController.incrementSecurityCodeUsage
);

// DELETE - Désactiver un code de sécurité
router.delete(
  '/:id/security-code/deactivate',
  authorize('client', 'superadmin'),
  buildingController.deactivateSecurityCode
);

// ===== GESTION RESPONSABLES =====

// POST - Ajouter un responsable
router.post(
  '/:buildingId/responsables',
  authorize('client', 'superadmin', 'mainteneur_interne'),
  buildingController.addResponsable
);

// GET - Récupérer les responsables
router.get(
  '/:buildingId/responsables',
  buildingController.getResponsables
);

// PUT - Modifier un responsable
router.put(
  '/:buildingId/responsables/:responsableId',
  authorize('client', 'superadmin', 'mainteneur_interne'),
  buildingController.updateResponsable
);

// DELETE - Supprimer un responsable
router.delete(
  '/:buildingId/responsables/:responsableId',
  authorize('client', 'superadmin', 'mainteneur_interne'),
  buildingController.deleteResponsable
);

module.exports = router;
