const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { uploadMiddleware, handleMulterError } = require('../middleware/upload');
const quoteController = require('../controllers/quoteController');
const { tenantIsolation } = require('../middleware/tenantIsolation');

// Routes protégées
router.use(protect);
router.use(tenantIsolation);

// ===== STATISTIQUES (AVANT :id) =====
router.get('/stats/overview', quoteController.getQuoteStats);

// ===== GESTION DEMANDES =====

// GET - Récupérer toutes les demandes de devis
router.get('/', quoteController.getAllQuotes);

// GET - Récupérer une demande spécifique
router.get('/:id', quoteController.getQuoteById);

// POST - Créer une demande de devis
router.post(
  '/',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne', 'responsable_affaires', 'technicien'),
  quoteController.createQuote
);

// PUT - Modifier une demande
router.put(
  '/:id',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne', 'responsable_affaires'),
  quoteController.updateQuote
);

// DELETE - Supprimer une demande
router.delete(
  '/:id',
  authorize('client', 'client_admin', 'superadmin'),
  quoteController.deleteQuote
);

// ===== STATUTS =====

// PATCH - Changer le statut
router.patch(
  '/:id/status',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne', 'responsable_affaires', 'technicien'),
  quoteController.updateStatus
);

// ===== DEVIS =====

// POST - Upload devis/proposition commerciale
router.post(
  '/:id/devis',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne', 'responsable_affaires'),
  uploadMiddleware.generic,
  handleMulterError,
  quoteController.uploadDevis
);

// PUT - Modifier devis
router.put(
  '/:id/devis',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne', 'responsable_affaires'),
  quoteController.updateDevis
);

// ===== VALIDATIONS =====

// POST - Valider/Rejeter une demande
router.post(
  '/:id/validate',
  authorize('client', 'client_admin', 'superadmin'),
  quoteController.validateQuote
);

// POST - Ajouter un commentaire de validation
// NOTE: Fonction commentée car utilise l'ancien système
/*
router.post(
  '/:id/validation-comment',
  authorize('client', 'client_admin', 'superadmin'),
  quoteController.addValidationComment
);
*/

// ===== COMMUNICATION =====

// POST - Ajouter un message
// NOTE: Fonction commentée car utilise l'ancien système
/*
router.post(
  '/:id/message',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne', 'technicien'),
  quoteController.addMessage
);
*/

// GET - Récupérer les messages
// NOTE: Fonction commentée car utilise l'ancien système
/*
router.get('/:id/messages', quoteController.getMessages);
*/

// ===== DOCUMENTS =====

// POST - Ajouter un document
router.post(
  '/:id/documents',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  uploadMiddleware.generic,
  handleMulterError,
  quoteController.addDocument
);

// DELETE - Supprimer un document
router.delete(
  '/:id/documents/:docId',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  quoteController.deleteDocument
);

// ===== EXPORT =====
router.get('/:id/export/pdf', quoteController.exportPDF);

// ===== NOUVELLES FONCTIONNALITÉS =====

// POST - Enregistrer une consultation de devis avec notification
router.post('/:id/consultation', quoteController.registerQuoteConsultation);

// POST - Générer PDF pour un devis
router.post('/:id/generate-pdf', quoteController.generateQuotePDFFile);

// POST - Générer Excel pour un devis
router.post('/:id/generate-excel', quoteController.generateQuoteExcelFile);

// POST - Créer devis pour plusieurs entreprises
router.post(
  '/multi-create',
  authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne'),
  quoteController.createMultiQuote
);

// ===== RÉPONSES DESTINATAIRES =====

// POST - Marquer un devis comme consulté par un destinataire
router.post('/:id/view', quoteController.markAsViewed);

// POST - Répondre à un devis (accepter avec montant)
router.post('/:id/respond', quoteController.respondToQuote);

// POST - Demander plus d'informations
router.post('/:id/request-info', quoteController.requestMoreInfo);

// POST - Refuser un devis
router.post('/:id/reject', quoteController.rejectQuote);

// PATCH - Mettre à jour le statut d'une réponse
router.patch(
  '/:id/responses/:responseId',
  authorize('client', 'client_admin', 'superadmin'),
  quoteController.updateResponse
);

module.exports = router;
