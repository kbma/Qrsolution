const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { tenantIsolation } = require('../middleware/tenantIsolation');
const {
  getInterventions,
  getInterventionById,
  createIntervention,
  updateIntervention,
  deleteIntervention,
  startIntervention,
  cancelIntervention,
  completeIntervention,
  createQuoteRequest,
  getStats
} = require('../controllers/interventionController');

// Routes protégées
router.use(protect);
router.use(tenantIsolation);

// Statistiques
router.get('/stats/summary', protect, getStats);

// Routes principales
router.route('/')
  .get(protect, getInterventions)
  .post(protect, authorize('client', 'client_admin', 'superadmin', 'mainteneur_interne', 'responsable_affaires'), createIntervention);

router.route('/:id')
  .get(protect, getInterventionById)
  .put(protect, updateIntervention)
  .delete(protect, authorize('client', 'client_admin', 'superadmin'), deleteIntervention);

// Actions sur interventions
router.patch('/:id/start', protect, authorize('technicien', 'mainteneur_interne', 'mainteneur_externe'), startIntervention);
router.patch('/:id/cancel', protect, authorize('client', 'client_admin', 'mainteneur_interne', 'mainteneur_externe'), cancelIntervention);
router.put('/:id/complete', protect, authorize('technicien', 'mainteneur_interne', 'mainteneur_externe'), completeIntervention);

// Demande de devis
router.post('/:id/quote-request', protect, authorize('client', 'client_admin', 'mainteneur_interne'), createQuoteRequest);

module.exports = router;
