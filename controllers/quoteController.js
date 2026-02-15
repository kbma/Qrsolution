const Quote = require('../models/Quote');
const Equipment = require('../models/Equipment');
const Site = require('../models/Site');
const Building = require('../models/Building');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getPaginationParams, buildPaginationResponse } = require('../utils/pagination');
const { sendEmail, sendQuoteNotification, sendQuoteConsultationNotification } = require('../utils/email');
const { generateQuotePDF, generateQuoteExcel } = require('../utils/pdfGenerator');
const fs = require('fs');
const path = require('path');

// Helper: normaliser les statuts entrants pour éviter les variantes accentuées/typos
const normalizeResponseStatus = (status) => {
  if (!status) return status;
  const s = String(status).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (['accepte', 'acceptee', 'approuve', 'approuvee', 'accepte_e', 'accepte'].includes(s) || s.startsWith('accept')) return 'accepte';
  if (['refuse', 'refusee', 'rejete', 'rejetee', 'reject', 'rejette'].includes(s) || s.startsWith('refus')) return 'refuse';
  if (s.includes('reponse') || s.includes('propos')) return 'reponse_envoyee';
  if (s.includes('demande') && s.includes('info')) return 'demande_infos';
  if (s === 'vu' || s === 'view') return 'vu';
  return status;
};

// Générer un numéro de devis unique
const generateQuoteNumber = async (tenantId) => {
  const currentYear = new Date().getFullYear();
  const count = await Quote.countDocuments({
    numero: { $regex: `^DEV-${currentYear}` },
    tenantId: tenantId
  });
  return `DEV-${currentYear}-${String(count + 1).padStart(5, '0')}`;
};

// ===== CRUD DEMANDES DEVIS =====

/**
 * GET - Récupérer toutes les demandes de devis avec pagination
 */
exports.getAllQuotes = async (req, res) => {
  try {
    const { demandeur, destinataire, statut, type, site, search } = req.query;
    const { page, limit, skip } = getPaginationParams(req);
    let query = {};

    // Filtres
    if (demandeur) query.demandeur = demandeur;
    if (destinataire) query.destinataires = destinataire; // Changé pour destinataires (array)
    if (statut) query.statut = statut;
    if (type) query.typeTravaux = type; // Changé pour typeTravaux
    if (site) query.site = site;

    // Recherche
    if (search) {
      query.$or = [
        { numero: { $regex: search, $options: 'i' } },
        { objet: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Filtrer par permissions (multi-tenant)
    if (req.user.role !== 'superadmin') {
      // Tous les autres rôles voient les devis de leur tenant
      query.tenantId = req.user.tenantId;
      
      // Filtres supplémentaires selon le rôle
      if (req.user.role === 'client' || req.user.role === 'client_admin') {
        // Les clients voient seulement les devis qu'ils ont demandés
        query.demandeur = req.user._id;
      } else if (['mainteneur_externe', 'mainteneur_interne', 'mainteneur'].includes(req.user.role)) {
        // Les mainteneurs voient les devis où ils sont destinataires
        query.destinataires = req.user._id;
      }
    }

    // Compter total
    const total = await Quote.countDocuments(query);

    // Requête
    let quoteQuery = Quote.find(query)
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('site', 'nom adresse')
      .populate('equipment', 'nom type')
      .sort({ dateDemande: -1 });

    // Appliquer pagination
    if (limit > 0) {
      quoteQuery = quoteQuery.skip(skip).limit(limit);
    }

    const quotes = await quoteQuery;

    res.json(buildPaginationResponse(quotes, total, { page, limit }));
  } catch (error) {
    console.error('Erreur getAllQuotes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Récupérer une demande spécifique
 */
exports.getQuoteById = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('site', 'nom adresse')
      .populate('equipment', 'nom type marque modele');

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    res.json({ success: true, data: quote });
  } catch (error) {
    console.error('Erreur getQuoteById:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Créer une demande de devis
 */
exports.createQuote = async (req, res) => {
  try {
    const { equipment, site, building, destinataires, typeTravaux, description, urgence } = req.body;

    // Validation
    if (!equipment || !site || !destinataires || destinataires.length === 0 || !typeTravaux) {
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    }

    // Vérifier l'équipement existe
    const equipExists = await Equipment.findById(equipment);
    if (!equipExists) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    // Vérifier que tous les destinataires existent
    for (const destId of destinataires) {
      const destinataireExists = await User.findById(destId);
      if (!destinataireExists) {
        return res.status(404).json({ success: false, message: `Destinataire ${destId} non trouvé` });
      }
    }

    // Générer numéro unique
    const numero = await generateQuoteNumber(req.user.tenantId);

    const quote = new Quote({
      numero,
      demandeur: req.user._id,
      destinataires,
      equipment,
      site,
      building: building || null,
      typeTravaux,
      description,
      urgence: urgence || 'normale',
      statut: 'envoyee',
      tenantId: req.user.tenantId,
      responses: destinataires.map(dest => ({
        destinataire: dest,
        statut: 'en_attente'
      }))
    });

    await quote.save();

    const populated = await quote
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('equipment', 'nom type')
      .populate('site', 'nom adresse');

    res.status(201).json({
      success: true,
      message: 'Demande créée avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur createQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT - Modifier une demande
 */
exports.updateQuote = async (req, res) => {
  try {
    const { typeTravaux, description, urgence } = req.body;

    let quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Seuls les demandeurs peuvent modifier
    if (quote.demandeur.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }

    // Mise à jour
    if (typeTravaux) quote.typeTravaux = typeTravaux;
    if (description) quote.description = description;
    if (urgence) quote.urgence = urgence;

    quote.updatedAt = new Date();
    await quote.save();

    const populated = await quote
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('equipment', 'nom type')
      .populate('site', 'nom adresse');

    res.json({
      success: true,
      message: 'Demande modifiée avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur updateQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE - Supprimer une demande
 */
exports.deleteQuote = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Seuls les demandeurs peuvent supprimer
    if (quote.demandeur.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }

    await Quote.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Demande supprimée avec succès' });
  } catch (error) {
    console.error('Erreur deleteQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== STATUTS =====

/**
 * PATCH - Changer le statut
 */
exports.updateStatus = async (req, res) => {
  try {
    const { statut } = req.body;
    const validStatuts = ['brouillon', 'envoyee', 'accepte', 'rejetee', 'en_cours', 'completee'];

    if (!statut || !validStatuts.includes(statut)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    quote.statut = statut;
    quote.updatedAt = new Date();

    await quote.save();

    const populated = await quote
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('equipment', 'nom type')
      .populate('site', 'nom adresse');

    res.json({
      success: true,
      message: 'Statut modifié avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur updateStatus:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== DEVIS =====

/**
 * POST - Upload devis/proposition commerciale (pour un destinataire spécifique)
 */
exports.uploadDevis = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    const { montantHT, devise, delai, conditions, message } = req.body;

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Vérifier que l'utilisateur est un destinataire de ce devis
    const isDestinataire = quote.destinataires.some(dest => dest.toString() === req.user._id.toString());
    if (!isDestinataire && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Vous n\'êtes pas destinataire de ce devis' });
    }

    // Trouver ou créer la réponse pour ce destinataire
    let response = quote.responses.find(r => r.destinataire.toString() === req.user._id.toString());
    if (!response) {
      response = {
        destinataire: req.user._id,
        statut: 'reponse_envoyee'
      };
      quote.responses.push(response);
    } else {
      response.statut = 'reponse_envoyee';
    }

    // Mettre à jour la réponse
    if (montantHT) response.montantHT = parseFloat(montantHT);
    if (devise) response.devise = devise;
    if (delai) response.delai = delai;
    if (conditions) response.conditions = conditions;
    if (message) response.message = message;

    response.documentUrl = req.file.path.replace(/\\/g, '/');
    response.dateReponse = new Date();

    // Calculer la validité (30 jours par défaut)
    const validiteJours = req.body.validiteJours || 30;
    response.validiteDevis = new Date();
    response.validiteDevis.setDate(response.validiteDevis.getDate() + validiteJours);

    quote.updatedAt = new Date();
    await quote.save();

    const populated = await quote
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('responses.destinataire', 'nom prenom email entreprise');

    res.json({
      success: true,
      message: 'Devis uploadé avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur uploadDevis:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT - Modifier devis (pour un destinataire spécifique)
 */
exports.updateDevis = async (req, res) => {
  try {
    const { montantHT, devise, delai, conditions, message, modificationsDemandees } = req.body;

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Vérifier que l'utilisateur est un destinataire
    const isDestinataire = quote.destinataires.some(dest => dest.toString() === req.user._id.toString());
    if (!isDestinataire && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Vous n\'êtes pas destinataire de ce devis' });
    }

    // Trouver la réponse de ce destinataire
    const response = quote.responses.find(r => r.destinataire.toString() === req.user._id.toString());
    if (!response) {
      return res.status(404).json({ success: false, message: 'Aucune réponse trouvée pour ce devis' });
    }

    // Mise à jour
    if (montantHT !== undefined) response.montantHT = parseFloat(montantHT);
    if (devise) response.devise = devise;
    if (delai) response.delai = delai;
    if (conditions) response.conditions = conditions;
    if (message) response.message = message;
    if (modificationsDemandees) response.modificationsDemandees = modificationsDemandees;

    response.dateReponse = new Date();
    quote.updatedAt = new Date();

    await quote.save();

    const populated = await quote
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('responses.destinataire', 'nom prenom email entreprise');

    res.json({
      success: true,
      message: 'Devis modifié avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur updateDevis:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== VALIDATIONS =====

/**
 * POST - Valider/Rejeter une réponse à un devis
 */
exports.validateQuote = async (req, res) => {
  try {
    const { destinataireId, decision, commentaire } = req.body;
    const validDecisions = ['approuve', 'rejete'];

    if (!decision || !validDecisions.includes(decision)) {
      return res.status(400).json({ success: false, message: 'Décision invalide' });
    }

    if (!destinataireId) {
      return res.status(400).json({ success: false, message: 'ID du destinataire requis' });
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Seuls les demandeurs peuvent valider les réponses
    if (quote.demandeur.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Seul le demandeur peut valider les réponses' });
    }

    // Trouver la réponse du destinataire
    const response = quote.responses.find(r => r.destinataire.toString() === destinataireId);
    if (!response) {
      return res.status(404).json({ success: false, message: 'Réponse non trouvée' });
    }

    // Mettre à jour le statut de validation (normaliser les variantes possibles)
    response.statut = normalizeResponseStatus(decision);
    response.commentaire = commentaire || '';
    response.dateValidation = new Date();

    // Mettre à jour le statut global du devis si nécessaire
    const allResponses = quote.responses.length;

    const approvedResponses = quote.responses.filter(r => r.statut === 'accepte' || r.statut === 'approuve').length;
    const rejectedResponses = quote.responses.filter(r => r.statut === 'refuse' || r.statut === 'rejete').length;

    if (approvedResponses > 0) {
      quote.statut = 'accepte';
    } else if (rejectedResponses === allResponses) {
      quote.statut = 'rejetee';
    }

    quote.updatedAt = new Date();
    await quote.save();

    const populated = await quote
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('responses.destinataire', 'nom prenom email entreprise');

    res.json({
      success: true,
      message: `Réponse ${decision === 'approuve' ? 'approuvée' : 'rejetée'} avec succès`,
      data: populated
    });
  } catch (error) {
    console.error('Erreur validateQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Ajouter un commentaire de validation
 * NOTE: Cette fonction utilise l'ancien système de validations.
 * À adapter pour le nouveau système de réponses.
 */
/*
exports.addValidationComment = async (req, res) => {
  try {
    const { commentaire } = req.body;

    const quote = await QuoteRequest.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Ajouter le commentaire à la dernière validation
    if (quote.validations.length > 0) {
      const lastValidation = quote.validations[quote.validations.length - 1];
      if (!lastValidation.commentaire) {
        lastValidation.commentaire = commentaire;
      } else {
        lastValidation.commentaire += '\n' + commentaire;
      }
    }

    quote.updatedAt = new Date();
    await quote.save();

    res.json({
      success: true,
      message: 'Commentaire ajouté avec succès',
      data: quote.validations
    });
  } catch (error) {
    console.error('Erreur addValidationComment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
*/

// ===== COMMUNICATION =====

/**
 * POST - Ajouter un message
 * NOTE: Cette fonction utilise l'ancien système de messages.
 * À adapter pour le nouveau système de réponses.
 */
/*
exports.addMessage = async (req, res) => {
  try {
    const { contenu } = req.body;

    const quote = await QuoteRequest.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    quote.messages.push({
      auteur: req.user._id,
      contenu,
      dateMessage: new Date()
    });

    await quote.save();

    const populated = await quote.populate('messages.auteur', 'nom email');

    res.json({
      success: true,
      message: 'Message ajouté avec succès',
      data: populated.messages
    });
  } catch (error) {
    console.error('Erreur addMessage:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
*/

/**
 * GET - Récupérer les messages
 */
exports.getMessages = async (req, res) => {
  try {
    const quote = await QuoteRequest.findById(req.params.id)
      .populate('messages.auteur', 'nom email');

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    res.json({
      success: true,
      count: quote.messages.length,
      data: quote.messages
    });
  } catch (error) {
    console.error('Erreur getMessages:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== DOCUMENTS =====

/**
 * POST - Ajouter un document
 */
exports.addDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    quote.documents.push({
      nom: req.body.nom || req.file.originalname,
      url: req.file.path.replace(/\\/g, '/'),
      type: req.body.type || 'document',
      uploadedAt: new Date()
    });

    await quote.save();

    res.json({
      success: true,
      message: 'Document ajouté avec succès',
      data: quote.documents
    });
  } catch (error) {
    console.error('Erreur addDocument:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE - Supprimer un document
 */
exports.deleteDocument = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    const docIndex = quote.documents.findIndex(d => d._id.toString() === req.params.docId);
    if (docIndex === -1) {
      return res.status(404).json({ success: false, message: 'Document non trouvé' });
    }

    const doc = quote.documents[docIndex];
    const filePath = path.join(__dirname, '../', doc.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    quote.documents.splice(docIndex, 1);
    await quote.save();

    res.json({ success: true, message: 'Document supprimé avec succès' });
  } catch (error) {
    console.error('Erreur deleteDocument:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== EXPORT ET STATISTIQUES =====

/**
 * GET - Export PDF d'une demande
 */
exports.exportPDF = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('demandeur', 'nom prenom email telephone entreprise')
      .populate('destinataires', 'nom prenom email entreprise')
      .populate('equipment', 'nom type marque modele')
      .populate('site', 'nom adresse');

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quote-${quote.numero}.pdf"`);

    doc.pipe(res);

    // En-tête
    doc.fontSize(20).text('Demande de Devis', { underline: true });
    doc.fontSize(12);

    // Infos
    doc.text(`Numéro: ${quote.numero}`);
    doc.text(`Statut: ${quote.statut}`);
    doc.text(`Type de travaux: ${quote.typeTravaux}`);
    doc.text(`Urgence: ${quote.urgence}`);
    doc.text(`Demandeur: ${quote.demandeur.nom} ${quote.demandeur.prenom}`);
    if (quote.demandeur.entreprise) {
      doc.text(`Entreprise: ${quote.demandeur.entreprise}`);
    }
    doc.text(`Destinataires: ${quote.destinataires.map(d => `${d.nom} ${d.prenom}`).join(', ')}`);
    if (quote.equipment) {
      doc.text(`Équipement: ${quote.equipment.nom} (${quote.equipment.type})`);
    }
    if (quote.site) {
      doc.text(`Site: ${quote.site.nom}`);
    }
    doc.text(`Date création: ${new Date(quote.createdAt).toLocaleDateString('fr-FR')}`);

    if (quote.description) {
      doc.moveDown().text('Description:', { underline: true });
      doc.fontSize(11).text(quote.description);
    }

    // Réponses
    if (quote.responses && quote.responses.length > 0) {
      doc.moveDown().text('Réponses:', { underline: true });
      quote.responses.forEach((response, index) => {
        doc.fontSize(10).text(`Réponse ${index + 1} - ${response.destinataire.nom} ${response.destinataire.prenom}:`);
        doc.text(`Statut: ${response.statut}`);
        if (response.montantHT) {
          doc.text(`Montant HT: ${response.montantHT} ${response.devise}`);
        }
        if (response.delai) {
          doc.text(`Délai: ${response.delai}`);
        }
        if (response.message) {
          doc.text(`Message: ${response.message}`);
        }
        doc.moveDown();
      });
    }

    doc.end();
  } catch (error) {
    console.error('Erreur exportPDF:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Statistiques
 */
exports.getQuoteStats = async (req, res) => {
  try {
    let query = {};

    // Filtrer par tenant si pas superadmin
    if (req.user.role !== 'superadmin') {
      query.tenantId = req.user.tenantId;
    }

    const total = await Quote.countDocuments(query);
    const byStatut = await Quote.aggregate([
      { $match: query },
      { $group: { _id: '$statut', count: { $sum: 1 } } }
    ]);
    const byType = await Quote.aggregate([
      { $match: query },
      { $group: { _id: '$typeTravaux', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        total,
        byStatut,
        byType
      }
    });
  } catch (error) {
    console.error('Erreur getQuoteStats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== NOUVELLES FONCTIONNALITÉS =====

/**
 * POST - Enregistrer une consultation de devis avec notification
 */
exports.registerQuoteConsultation = async (req, res) => {
  try {
    const quoteId = req.params.id;
    const quote = await Quote.findById(quoteId)
      .populate('demandeur', 'nom prenom email entreprise');

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Ajouter la consultation à l'historique
    quote.consultations.push({
      consultePar: req.user._id,
      dateConsultation: new Date(),
      notificationEnvoyee: false
    });

    await quote.save();

    // Envoyer notification au demandeur
    if (quote.demandeur && quote.demandeur.email) {
      try {
        await sendQuoteConsultationNotification(quote, req.user, quote.demandeur);

        // Marquer la notification comme envoyée
        const dernierIndex = quote.consultations.length - 1;
        quote.consultations[dernierIndex].notificationEnvoyee = true;
        await quote.save();
      } catch (emailError) {
        console.error('Erreur envoi email consultation:', emailError);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Consultation enregistrée',
      data: quote
    });
  } catch (error) {
    console.error('Erreur registerQuoteConsultation:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Générer PDF pour un devis
 */
exports.generateQuotePDFFile = async (req, res) => {
  try {
    const quoteId = req.params.id;
    const quote = await Quote.findById(quoteId)
      .populate('demandeur', 'nom prenom email telephone entreprise')
      .populate('destinataires', 'nom prenom email telephone entreprise')
      .populate('site', 'nom adresse')
      .populate('equipment', 'nom type marque modele')
      .populate('responses.destinataire', 'nom prenom email entreprise');

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Créer le dossier s'il n'existe pas
    const pdfDir = path.join(__dirname, '../uploads/quotes-pdf');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const filename = `devis-${quote.numero}-${Date.now()}.pdf`;
    const filepath = path.join(pdfDir, filename);

    await generateQuotePDF(quote, filepath);

    // Mettre à jour le devis avec l'URL du PDF
    quote.traceabilite.pdfUrl = `/uploads/quotes-pdf/${filename}`;
    quote.traceabilite.generatedAt = new Date();
    await quote.save();

    res.json({
      success: true,
      message: 'PDF généré avec succès',
      pdfUrl: quote.traceabilite.pdfUrl
    });
  } catch (error) {
    console.error('Erreur generateQuotePDFFile:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Générer Excel pour un devis
 */
exports.generateQuoteExcelFile = async (req, res) => {
  try {
    const quoteId = req.params.id;
    const quote = await Quote.findById(quoteId)
      .populate('demandeur', 'nom prenom email telephone entreprise')
      .populate('destinataires', 'nom prenom email telephone entreprise')
      .populate('site', 'nom adresse')
      .populate('equipment', 'nom type marque modele')
      .populate('responses.destinataire', 'nom prenom email entreprise');

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'superadmin' && quote.tenantId.toString() !== req.user.tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Créer le dossier s'il n'existe pas
    const excelDir = path.join(__dirname, '../uploads/quotes-excel');
    if (!fs.existsSync(excelDir)) {
      fs.mkdirSync(excelDir, { recursive: true });
    }

    const filename = `devis-${quote.numero}-${Date.now()}.xlsx`;
    const filepath = path.join(excelDir, filename);

    await generateQuoteExcel(quote, filepath);

    // Mettre à jour le devis avec l'URL du Excel
    quote.traceabilite.excelUrl = `/uploads/quotes-excel/${filename}`;
    quote.traceabilite.generatedAt = new Date();
    await quote.save();

    res.json({
      success: true,
      message: 'Excel généré avec succès',
      excelUrl: quote.traceabilite.excelUrl
    });
  } catch (error) {
    console.error('Erreur generateQuoteExcelFile:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Créer une demande de devis pour plusieurs entreprises
 * NOTE: Version utilisant QuoteRequest - REMPLACÉE par createMultiQuote plus bas
 */
/*
exports.createMultiQuote = async (req, res) => {
  try {
    const {
      destinataireIds, // Array d'IDs d'entreprises
      equipment,
      site,
      building,
      type,
      description,
      urgence,
      montantHT,
      dateReponseAttendue,
      datePrevisionnelleTravaux,
      piecesSuplementaires,
      message
    } = req.body;

    if (!destinataireIds || destinataireIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez sélectionner au moins un destinataire'
      });
    }

    // Générer numéro unique
    const numero = await generateQuoteNumber();

    // Créer un devis avec plusieurs destinataires
    const newQuote = new QuoteRequest({
      tenantId: req.user.tenantId,
      numero,
      demandeur: req.user._id,
      typeDemandeur: req.user.role === 'client' ? 'client' : 'mainteneur',
      destinataires: destinataireIds,
      equipment,
      site,
      building,
      objet: type, // Utiliser le type comme objet
      description,
      typeTravaux: type,
      urgence,
      montantHT,
      dateReponseAttendue,
      datePrevisionnelleTravaux,
      piecesSuplementaires,
      nomSociete: req.user.entreprise,
      logoSociete: req.user.logo,
      // Initialiser les réponses pour chaque destinataire
      responses: destinataireIds.map(destId => ({
        destinataire: destId,
        statut: 'en_attente'
      }))
    });

    await newQuote.save();

    // Envoyer notifications aux destinataires
    for (const destinataireId of destinataireIds) {
      const destinataire = await User.findById(destinataireId);
      if (destinataire && destinataire.email) {
        try {
          await sendQuoteNotification(newQuote, destinataire);
        } catch (emailError) {
          console.error('Erreur envoi email:', emailError);
        }
      }
    }

    res.status(201).json({
      success: true,
      message: `Devis ${numero} créé avec succès pour ${destinataireIds.length} destinataires`,
      data: newQuote
    });
  } catch (error) {
    console.error('Erreur createMultiQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
*/

// ===== GESTION DES RÉPONSES AUX DEVIS =====

/**
 * POST - Marquer un devis comme consulté par un destinataire
 */
exports.markQuoteAsViewed = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const userId = req.user._id;

    const quote = await Quote.findOne({
      _id: quoteId,
      destinataires: userId,
      tenantId: req.user.tenantId
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Mettre à jour la réponse du destinataire
    const responseIndex = quote.responses.findIndex(r => r.destinataire.toString() === userId.toString());
    if (responseIndex >= 0) {
      quote.responses[responseIndex].statut = 'vu';
      quote.responses[responseIndex].dateConsultation = new Date();
    } else {
      quote.responses.push({
        destinataire: userId,
        statut: 'vu',
        dateConsultation: new Date()
      });
    }

    await quote.save();

    res.json({ success: true, message: 'Devis marqué comme consulté' });
  } catch (error) {
    console.error('Erreur markQuoteAsViewed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Répondre à un devis (proposer un montant)
 */
exports.respondToQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { montantHT, devise, delai, conditions, message, documentUrl } = req.body;
    const userId = req.user._id;

    const quote = await Quote.findOne({
      _id: quoteId,
      destinataires: userId,
      tenantId: req.user.tenantId
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Mettre à jour la réponse du destinataire
    const responseIndex = quote.responses.findIndex(r => r.destinataire.toString() === userId.toString());
    if (responseIndex >= 0) {
      quote.responses[responseIndex] = {
        ...quote.responses[responseIndex],
        statut: 'reponse_envoyee',
        montantHT,
        devise: devise || 'EUR',
        delai,
        conditions,
        message,
        documentUrl,
        dateReponse: new Date()
      };
    } else {
      quote.responses.push({
        destinataire: userId,
        statut: 'reponse_envoyee',
        montantHT,
        devise: devise || 'EUR',
        delai,
        conditions,
        message,
        documentUrl,
        dateReponse: new Date()
      });
    }

    await quote.save();

    res.json({ success: true, message: 'Réponse envoyée avec succès' });
  } catch (error) {
    console.error('Erreur respondToQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Demander plus d'informations sur un devis
 */
exports.requestMoreInfo = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    const quote = await Quote.findOne({
      _id: quoteId,
      destinataires: userId,
      tenantId: req.user.tenantId
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Mettre à jour la réponse du destinataire
    const responseIndex = quote.responses.findIndex(r => r.destinataire.toString() === userId.toString());
    if (responseIndex >= 0) {
      quote.responses[responseIndex].statut = 'demande_infos';
      quote.responses[responseIndex].modificationsDemandees = message;
      quote.responses[responseIndex].dateReponse = new Date();
    } else {
      quote.responses.push({
        destinataire: userId,
        statut: 'demande_infos',
        modificationsDemandees: message,
        dateReponse: new Date()
      });
    }

    await quote.save();

    res.json({ success: true, message: 'Demande d\'informations supplémentaires envoyée' });
  } catch (error) {
    console.error('Erreur requestMoreInfo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Refuser un devis
 */
exports.rejectQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    const quote = await Quote.findOne({
      _id: quoteId,
      destinataires: userId,
      tenantId: req.user.tenantId
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Mettre à jour la réponse du destinataire
    const responseIndex = quote.responses.findIndex(r => r.destinataire.toString() === userId.toString());
    if (responseIndex >= 0) {
      quote.responses[responseIndex].statut = 'refuse';
      quote.responses[responseIndex].message = message;
      quote.responses[responseIndex].dateReponse = new Date();
    } else {
      quote.responses.push({
        destinataire: userId,
        statut: 'refuse',
        message,
        dateReponse: new Date()
      });
    }

    await quote.save();

    res.json({ success: true, message: 'Devis refusé' });
  } catch (error) {
    console.error('Erreur rejectQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Marquer un devis comme vu
 * NOTE: Fonction dupliquée - voir la version plus haut qui utilise Quote
 */
/*
exports.markQuoteAsViewed = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const userId = req.user._id;

    const quote = await QuoteRequest.findOne({
      _id: quoteId,
      destinataires: userId,
      tenantId: req.user.tenantId
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Mettre à jour la réponse du destinataire
    const responseIndex = quote.responses.findIndex(r => r.destinataire.toString() === userId.toString());
    if (responseIndex >= 0) {
      quote.responses[responseIndex].statut = 'vu';
      quote.responses[responseIndex].dateConsultation = new Date();
    } else {
      quote.responses.push({
        destinataire: userId,
        statut: 'vu',
        dateConsultation: new Date()
      });
    }

    await quote.save();

    res.json({ success: true, message: 'Devis marqué comme vu' });
  } catch (error) {
    console.error('Erreur markQuoteAsViewed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
*/

/**
 * POST - Répondre à un devis
 */
exports.respondToQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { montantHT, tva, montantTTC, devise, message } = req.body;
    const userId = req.user._id;

    const quote = await QuoteRequest.findOne({
      _id: quoteId,
      destinataires: userId,
      tenantId: req.user.tenantId
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Mettre à jour la réponse du destinataire
    const responseIndex = quote.responses.findIndex(r => r.destinataire.toString() === userId.toString());
    if (responseIndex >= 0) {
      quote.responses[responseIndex].statut = 'reponse_envoyee';
      quote.responses[responseIndex].montantHT = montantHT;
      quote.responses[responseIndex].devise = devise;
      quote.responses[responseIndex].message = message;
      quote.responses[responseIndex].dateReponse = new Date();
    } else {
      quote.responses.push({
        destinataire: userId,
        statut: 'reponse_envoyee',
        montantHT,
        devise,
        message,
        dateReponse: new Date()
      });
    }

    await quote.save();

    res.json({ success: true, message: 'Réponse envoyée avec succès' });
  } catch (error) {
    console.error('Erreur respondToQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Créer un devis multi-destinataires
 */
exports.createMultiQuote = async (req, res) => {
  try {
    const {
      equipment,
      site,
      type,
      description,
      message,
      urgence,
      destinataireIds
    } = req.body;

    // Validation
    if (!destinataireIds || destinataireIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Au moins un destinataire requis' });
    }

    if (!site) {
      return res.status(400).json({ success: false, message: 'Site requis' });
    }

    // Générer le numéro unique
    const numero = await generateQuoteNumber();

    // Mapper le rôle utilisateur vers les valeurs acceptées par le modèle
    const mapRoleToTypeDemandeur = (role) => {
      if (role === 'client' || role === 'client_admin') return 'client';
      if (role === 'mainteneur' || role === 'mainteneur_externe' || role === 'mainteneur_interne') return 'mainteneur';
      return 'client'; // Valeur par défaut
    };

    // Créer le devis multi-destinataires
    const quote = new Quote({
      tenantId: req.user.tenantId,
      numero,
      demandeur: req.user._id,
      typeDemandeur: mapRoleToTypeDemandeur(req.user.role),
      destinataires: destinataireIds,
      site,
      equipment: equipment || null,
      objet: `Demande de devis - ${type || 'maintenance'}`,
      description,
      typeTravaux: type || 'maintenance',
      urgence: urgence || 'normale',
      statut: 'en_attente',
      dateDemande: new Date(),
      // Initialiser les réponses pour chaque destinataire
      responses: destinataireIds.map(destId => ({
        destinataire: destId,
        statut: 'en_attente',
        dateReponse: null,
        message: message || null // Message optionnel du demandeur
      }))
    });

    await quote.save();

    // Peupler les données pour la réponse
    const populatedQuote = await Quote.findById(quote._id)
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('site', 'nom adresse')
      .populate('equipment', 'nom type');

    // Envoyer les notifications par email
    try {
      for (const destId of destinataireIds) {
        const destinataire = populatedQuote.destinataires.find(d => d._id.toString() === destId.toString());
        if (destinataire && destinataire.email) {
          // Ici on pourrait envoyer un email de notification
          console.log(`Notification envoyée à ${destinataire.email} pour le devis ${numero}`);
        }
      }
    } catch (emailError) {
      console.error('Erreur envoi email:', emailError);
      // Ne pas échouer la création pour autant
    }

    res.status(201).json({
      success: true,
      message: 'Devis multi-destinataires créé avec succès',
      data: populatedQuote
    });

  } catch (error) {
    console.error('Erreur createMultiQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== FONCTIONS POUR LES RÉPONSES DES DESTINATAIRES =====

/**
 * POST - Marquer un devis comme consulté par un destinataire
 */
exports.markAsViewed = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Vérifier que l'utilisateur est un destinataire
    if (!quote.destinataires.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Trouver ou créer la réponse pour ce destinataire
    let response = quote.responses.find(r => r.destinataire.toString() === req.user._id.toString());
    if (!response) {
      response = {
        destinataire: req.user._id,
        statut: 'vu',
        dateConsultation: new Date()
      };
      quote.responses.push(response);
    } else {
      response.statut = 'vu';
      response.dateConsultation = new Date();
    }

    await quote.save();

    res.json({
      success: true,
      message: 'Devis marqué comme consulté',
      data: quote
    });
  } catch (error) {
    console.error('Erreur markAsViewed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Répondre à un devis (accepter avec montant)
 */
exports.respondToQuote = async (req, res) => {
  try {
    const { montantHT, devise, delai, conditions, message, documentUrl } = req.body;
    
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Vérifier que l'utilisateur est un destinataire
    if (!quote.destinataires.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Trouver ou créer la réponse pour ce destinataire
    let response = quote.responses.find(r => r.destinataire.toString() === req.user._id.toString());
    if (!response) {
      response = {
        destinataire: req.user._id,
        statut: 'reponse_envoyee',
        montantHT: montantHT,
        devise: devise || 'EUR',
        delai: delai,
        conditions: conditions,
        message: message,
        documentUrl: documentUrl,
        dateReponse: new Date()
      };
      quote.responses.push(response);
    } else {
      response.statut = 'reponse_envoyee';
      response.montantHT = montantHT;
      response.devise = devise || 'EUR';
      response.delai = delai;
      response.conditions = conditions;
      response.message = message;
      response.documentUrl = documentUrl;
      response.dateReponse = new Date();
    }

    await quote.save();

    res.json({
      success: true,
      message: 'Réponse envoyée avec succès',
      data: quote
    });
  } catch (error) {
    console.error('Erreur respondToQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Demander plus d'informations
 */
exports.requestMoreInfo = async (req, res) => {
  try {
    const { message } = req.body;
    
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Vérifier que l'utilisateur est un destinataire
    if (!quote.destinataires.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Trouver ou créer la réponse pour ce destinataire
    let response = quote.responses.find(r => r.destinataire.toString() === req.user._id.toString());
    if (!response) {
      response = {
        destinataire: req.user._id,
        statut: 'demande_infos',
        modificationsDemandees: message,
        dateReponse: new Date()
      };
      quote.responses.push(response);
    } else {
      response.statut = 'demande_infos';
      response.modificationsDemandees = message;
      response.dateReponse = new Date();
    }

    await quote.save();

    res.json({
      success: true,
      message: 'Demande d\'informations envoyée',
      data: quote
    });
  } catch (error) {
    console.error('Erreur requestMoreInfo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Refuser un devis
 */
exports.rejectQuote = async (req, res) => {
  try {
    const { message } = req.body;
    
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Vérifier que l'utilisateur est un destinataire
    if (!quote.destinataires.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    // Trouver ou créer la réponse pour ce destinataire
    let response = quote.responses.find(r => r.destinataire.toString() === req.user._id.toString());
    if (!response) {
      response = {
        destinataire: req.user._id,
        statut: 'refuse',
        message: message,
        dateReponse: new Date()
      };
      quote.responses.push(response);
    } else {
      response.statut = 'refuse';
      response.message = message;
      response.dateReponse = new Date();
    }

    await quote.save();

    res.json({
      success: true,
      message: 'Devis refusé',
      data: quote
    });
  } catch (error) {
    console.error('Erreur rejectQuote:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH - Mettre à jour le statut d'une réponse spécifique
 */
exports.updateResponse = async (req, res) => {
  try {
    const { status, action } = req.body;
    const { id: quoteId, responseId } = req.params;

    const quote = await Quote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Devis non trouvé' });
    }

    // Vérifier que l'utilisateur est le demandeur (seul le demandeur peut accepter/refuser les réponses)
    if (quote.demandeur.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Seul le demandeur peut modifier le statut des réponses' });
    }

    // Trouver la réponse
    const response = quote.responses.id(responseId);
    if (!response) {
      return res.status(404).json({ success: false, message: 'Réponse non trouvée' });
    }

    // Mettre à jour le statut de la réponse
    response.statut = status;
    response.dateReponse = new Date();

    // Si c'est une acceptation, mettre à jour le statut global du devis
    if (status === 'accepte') {
      quote.statut = 'accepte';
      // Optionnel: refuser automatiquement les autres réponses
      quote.responses.forEach(r => {
        if (r._id.toString() !== responseId && r.statut !== 'refuse') {
          r.statut = 'refuse';
        }
      });
      // Notifier le destinataire dont la réponse a été acceptée
      try {
        const recipientId = response.destinataire;
        if (recipientId) {
          const recipient = await User.findById(recipientId);
          if (recipient) {
            // Créer notification
            await Notification.create({
              recipient: recipient._id,
              title: `Devis ${quote.numero} accepté`,
              message: `Votre proposition pour la demande ${quote.numero} a été acceptée.`,
              type: 'quote_response',
              relatedId: quote._id
            });

            // Ajouter accès au site si présent dans la demande
            if (quote.site) {
              const siteId = quote.site.toString();
              const hasSite = recipient.siteAccess?.some(a => a.site && a.site.toString() === siteId);
              if (!hasSite) {
                recipient.siteAccess = recipient.siteAccess || [];
                recipient.siteAccess.push({ site: quote.site, acces: 'lecture', viaQuote: quote._id });
              }
            }

            // Assurer les permissions basiques pour voir site/buildings/equipment
            recipient.permissions = recipient.permissions || [];
            const ensurePerm = (ress, act) => {
              if (!recipient.permissions.find(p => p.ressource === ress)) {
                recipient.permissions.push({ ressource: ress, action: act });
              }
            };
            ensurePerm('sites', 'read');
            ensurePerm('buildings', 'read');
            ensurePerm('equipment', 'read');

            await recipient.save();
          }
        }
      } catch (notifyErr) {
        console.error('Erreur en notifiant le destinataire:', notifyErr);
      }
    }

    await quote.save();

    res.json({
      success: true,
      message: `Réponse ${status} avec succès`,
      data: quote
    });
  } catch (error) {
    console.error('Erreur updateResponse:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH - Changer le statut d'une demande de devis
 */
exports.updateStatus = async (req, res) => {
  try {
    const { statut } = req.body;
    const quoteId = req.params.id;

    // Vérifier que le statut est valide
    const statutsValides = ['en_attente', 'recu', 'en_cours', 'soumis', 'accepte', 'refuse', 'expire'];
    if (!statutsValides.includes(statut)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide'
      });
    }

    // Récupérer la quote
    const quote = await Quote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Demande de devis non trouvée'
      });
    }

    // Vérifier les permissions selon le rôle
    if (req.user.role === 'client' || req.user.role === 'client_admin') {
      // Les clients peuvent seulement changer le statut de leurs propres demandes
      if (quote.demandeur.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Vous ne pouvez modifier que vos propres demandes'
        });
      }
      // Les clients ne peuvent pas accepter ou rejeter directement
      if (statut === 'accepte' || statut === 'refuse') {
        return res.status(403).json({
          success: false,
          message: 'Vous ne pouvez pas accepter ou rejeter directement une demande'
        });
      }
    } else if (['mainteneur_interne', 'responsable_affaires', 'technicien'].includes(req.user.role)) {
      // Les mainteneurs internes, responsables et techniciens peuvent modifier les statuts
      // mais seulement pour les devis de leur tenant
      if (quote.tenantId.toString() !== req.user.tenantId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à cette demande'
        });
      }
    }

    // Mettre à jour le statut
    quote.statut = statut;
    await quote.save();

    // Recharger avec les populations
    const updatedQuote = await Quote.findById(quoteId)
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('site', 'nom adresse')
      .populate('equipment', 'nom type marque modele');

    res.json({
      success: true,
      message: 'Statut mis à jour',
      data: updatedQuote
    });
  } catch (error) {
    console.error('Erreur updateStatus:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = exports;
