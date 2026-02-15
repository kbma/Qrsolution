const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadMiddleware } = require('../middleware/upload');

const {
  getAllQuotes,
  getQuoteById,
  createQuote,
  updateQuote,
  deleteQuote,
  updateStatus,
  uploadDevis,
  updateDevis,
  validateQuote,
  addValidationComment,
  addMessage,
  getMessages,
  addDocument,
  deleteDocument,
  exportPDF,
  getQuoteStats,
  registerQuoteConsultation,
  generateQuotePDFFile,
  generateQuoteExcelFile,
  createMultiQuote,
  markQuoteAsViewed,
  respondToQuote,
  requestMoreInfo,
  rejectQuote
} = require('../controllers/quoteController');

// --- Routes Spécifiques ---
router.get('/stats', protect, getQuoteStats);
router.post('/multi', protect, createMultiQuote);

// --- Routes Principales ---
router.route('/')
  .get(protect, getAllQuotes)
  .post(protect, createQuote);

// --- Routes Actions sur Devis ---
router.patch('/:id/status', protect, updateStatus);
router.post('/:id/validate', protect, validateQuote);
router.post('/:id/validate/comment', protect, addValidationComment);
router.post('/:id/consultation', protect, registerQuoteConsultation);

// --- Routes Réponses aux Devis ---
router.post('/:id/view', protect, markQuoteAsViewed);
router.post('/:id/respond', protect, respondToQuote);
router.post('/:id/request-info', protect, requestMoreInfo);
router.post('/:id/reject', protect, rejectQuote);
router.post('/:id/devis', protect, uploadMiddleware.quoteDevis, uploadDevis);
router.put('/:id/devis', protect, updateDevis);

router.post('/:id/documents', protect, uploadMiddleware.quoteDoc, addDocument);
router.delete('/:id/documents/:docId', protect, deleteDocument);

// --- Routes Messages ---
router.route('/:id/messages')
  .get(protect, getMessages)
  .post(protect, addMessage);

// --- Exports & Génération ---
router.get('/:id/export/pdf', protect, exportPDF);
router.post('/:id/generate-pdf', protect, generateQuotePDFFile);
router.post('/:id/generate-excel', protect, generateQuoteExcelFile);

// --- Routes CRUD par ID ---
router.route('/:id')
  .get(protect, getQuoteById)
  .put(protect, updateQuote)
  .delete(protect, deleteQuote);

module.exports = router;