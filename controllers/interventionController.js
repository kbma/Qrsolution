const Intervention = require('../models/Intervention');
const Equipment = require('../models/Equipment');
const Site = require('../models/Site');
const Quote = require('../models/Quote');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getPaginationParams, buildPaginationResponse } = require('../utils/pagination');
const { sendQuoteNotification } = require('../utils/email');

// Générer un numéro de devis unique
const generateQuoteNumber = async (tenantId) => {
  const currentYear = new Date().getFullYear();
  const count = await Quote.countDocuments({
    numero: { $regex: `^DEV-${currentYear}` },
    tenantId: tenantId
  });
  return `DEV-${currentYear}-${String(count + 1).padStart(5, '0')}`;
};

// @desc    Obtenir toutes les interventions avec pagination
// @route   GET /api/interventions
// @access  Private
exports.getInterventions = async (req, res) => {
  try {
    let query = {};
    const { page, limit, skip } = getPaginationParams(req);
    
    // Filtres
    if (req.query.site) query.site = req.query.site;
    if (req.query.equipment) query.equipment = req.query.equipment;
    if (req.query.statut) query.statut = req.query.statut;
    if (req.query.type) query.type = req.query.type;
    if (req.query.priorite) query.priorite = req.query.priorite;

    // Recherche
    if (req.query.search) {
      query.$or = [
        { numero: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    // Filtrer selon le rôle (multi-tenant)
    if (req.user.role === 'superadmin') {
      // Superadmin voit tout - pas de filtre
    } else if (req.user.role === 'client_admin' || req.user.role === 'client') {
      // Client admin voit les interventions de son tenant
      query.tenantId = req.user.tenantId;
    } else if (req.user.role === 'technicien' || req.user.role === 'mainteneur_externe' || req.user.role === 'responsable_affaires') {
      // Techniciens et responsables voient les interventions de leur tenant
      query.tenantId = req.user.tenantId;
      query['techniciens.technicien'] = req.user._id;
    } else {
      // Autres rôles - filtrer par tenant
      query.tenantId = req.user.tenantId;
    }
    
    // Compter total
    const total = await Intervention.countDocuments(query);

    // Requête
    let interventQuery = Intervention.find(query)
      .populate('equipment', 'nom type marque modele')
      .populate('site', 'nom adresse')
      .populate('techniciens.technicien', 'nom prenom')
      .sort('-dateDebut');

    // Appliquer pagination
    if (limit > 0) {
      interventQuery = interventQuery.skip(skip).limit(limit);
    }

    const interventions = await interventQuery;
    
    res.json(buildPaginationResponse(interventions, total, { page, limit }));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Obtenir une intervention par ID
// @route   GET /api/interventions/:id
// @access  Private
exports.getInterventionById = async (req, res) => {
  try {
    const intervention = await Intervention.findById(req.params.id)
      .populate('equipment', 'nom type marque modele numeroSerie localisation')
      .populate('site', 'nom adresse contact codeSecurite')
      .populate('techniciens.technicien', 'nom prenom email telephone')
      .populate('createdBy', 'nom prenom email');
    
    if (!intervention) {
      return res.status(404).json({
        success: false,
        message: 'Intervention non trouvée'
      });
    }
    
    res.json({
      success: true,
      data: intervention
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Créer une nouvelle intervention
// @route   POST /api/interventions
// @access  Private
exports.createIntervention = async (req, res) => {
  try {
    // Vérifier que l'équipement existe
    const equipment = await Equipment.findById(req.body.equipment);
    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Équipement non trouvé'
      });
    }
    
    // Récupérer le site de l'équipement
    const siteId = equipment.site;
    
    const numero = req.body.numero || `INT-${Date.now()}`;

    const intervention = await Intervention.create({
      ...req.body,
      numero,
      site: siteId,
      tenantId: req.user.tenantId,
      createdBy: req.user._id
    });
    
    res.status(201).json({
      success: true,
      data: intervention,
      message: 'Intervention créée avec succès'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Modifier une intervention
// @route   PUT /api/interventions/:id
// @access  Private
exports.updateIntervention = async (req, res) => {
  try {
    let intervention = await Intervention.findById(req.params.id);
    
    if (!intervention) {
      return res.status(404).json({
        success: false,
        message: 'Intervention non trouvée'
      });
    }
    
    // Ne pas permettre de modifier le numéro
    delete req.body.numero;
    
    intervention = await Intervention.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      data: intervention,
      message: 'Intervention mise à jour avec succès'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Supprimer une intervention
// @route   DELETE /api/interventions/:id
// @access  Private
exports.deleteIntervention = async (req, res) => {
  try {
    const intervention = await Intervention.findById(req.params.id);
    
    if (!intervention) {
      return res.status(404).json({
        success: false,
        message: 'Intervention non trouvée'
      });
    }
    
    // Vérifier si l'intervention est en cours
    if (intervention.statut === 'en_cours') {
      return res.status(400).json({
        success: false,
        message: 'Impossible de supprimer une intervention en cours'
      });
    }
    
    await intervention.deleteOne();
    
    res.json({
      success: true,
      message: 'Intervention supprimée avec succès'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Terminer une intervention
// @route   PUT /api/interventions/:id/complete
// @access  Private
exports.completeIntervention = async (req, res) => {
  try {
    const intervention = await Intervention.findById(req.params.id);
    
    if (!intervention) {
      return res.status(404).json({
        success: false,
        message: 'Intervention non trouvée'
      });
    }
    
    if (intervention.statut !== 'en_cours') {
      return res.status(400).json({
        success: false,
        message: 'Cette intervention n\'est pas en cours'
      });
    }
    
    intervention.statut = 'terminee';
    intervention.dateFin = new Date();
    
    // Calculer la durée réelle
    if (intervention.dateDebut) {
      const diff = intervention.dateFin - intervention.dateDebut;
      intervention.dureeReelle = diff / (1000 * 60 * 60); // en heures
    }
    
    // Ajouter les données de finalisation
    if (req.body.travauxEffectues) {
      intervention.travauxEffectues = req.body.travauxEffectues;
    }
    if (req.body.resultat) {
      intervention.resultat = req.body.resultat;
    }
    
    await intervention.save();
    
    // Mettre à jour le statut de l'équipement
    const newStatus = req.body.resultat?.equipementFonctionnel ? 'operationnel' : 'en_panne';
    await Equipment.findByIdAndUpdate(intervention.equipment, {
      statut: newStatus,
      'maintenance.derniereMaintenance': new Date()
    });
    
    res.json({
      success: true,
      data: intervention,
      message: 'Intervention terminée'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Obtenir les statistiques des interventions
// @route   GET /api/interventions/stats/summary
// @access  Private
exports.getStats = async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role === 'client') {
      const sites = await Site.find({ client: req.user._id }).select('_id');
      const siteIds = sites.map(s => s._id);
      query.site = { $in: siteIds };
    }
    
    const [total, planifiees, enCours, terminees, annulees] = await Promise.all([
      Intervention.countDocuments(query),
      Intervention.countDocuments({ ...query, statut: 'planifiee' }),
      Intervention.countDocuments({ ...query, statut: 'en_cours' }),
      Intervention.countDocuments({ ...query, statut: 'terminee' }),
      Intervention.countDocuments({ ...query, statut: 'annulee' })
    ]);
    
    res.json({
      success: true,
      data: {
        total,
        planifiees,
        enCours,
        terminees,
        annulees
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Démarrer une intervention (avec timer 24h pour annulation)
// @route   PATCH /api/interventions/:id/start
// @access  Private
exports.startIntervention = async (req, res) => {
  try {
    const intervention = await Intervention.findById(req.params.id);
    
    if (!intervention) {
      return res.status(404).json({
        success: false,
        message: 'Intervention non trouvée'
      });
    }
    
    // Vérifier les permissions
    if (req.user.role === 'client') {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à démarrer une intervention'
      });
    }
    
    intervention.statut = 'en_cours';
    intervention.dateDebut = new Date();
    intervention.heureDebutCancellable = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h depuis maintenant
    
    await intervention.save();
    
    res.json({
      success: true,
      data: intervention,
      message: 'Intervention démarrée. Annulation possible jusqu\'à ' + intervention.heureDebutCancellable.toLocaleString('fr-FR'),
      timeoutHours: 24
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Annuler une intervention (dans les 24h)
// @route   PATCH /api/interventions/:id/cancel
// @access  Private
exports.cancelIntervention = async (req, res) => {
  try {
    const intervention = await Intervention.findById(req.params.id);
    
    if (!intervention) {
      return res.status(404).json({
        success: false,
        message: 'Intervention non trouvée'
      });
    }
    
    // Vérifier que l'intervention est en cours
    if (intervention.statut !== 'en_cours') {
      return res.status(400).json({
        success: false,
        message: 'Seule une intervention en cours peut être annulée'
      });
    }
    
    // Vérifier qu'on est dans la fenêtre 24h
    if (!intervention.heureDebutCancellable || new Date() > intervention.heureDebutCancellable) {
      return res.status(400).json({
        success: false,
        message: 'Délai d\'annulation de 24h dépassé'
      });
    }
    
    intervention.statut = 'reportee';
    intervention.dateDebut = null;
    intervention.heureDebutCancellable = null;
    
    await intervention.save();
    
    res.json({
      success: true,
      data: intervention,
      message: 'Intervention annulée et reportée'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Créer une demande de devis pour une intervention
// @route   POST /api/interventions/:id/quote-request
// @access  Private
exports.createQuoteRequest = async (req, res) => {
  try {
    const intervention = await Intervention.findById(req.params.id)
      .populate('equipment')
      .populate('site');
    
    if (!intervention) {
      return res.status(404).json({
        success: false,
        message: 'Intervention non trouvée'
      });
    }
    
    const { destinataires, description, urgence, message } = req.body;
    
    if (!destinataires || destinataires.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez sélectionner au moins un destinataire'
      });
    }
    
    const QuoteRequest = require('../models/QuoteRequest');
    const { sendQuoteNotification } = require('../utils/email');
    const User = require('../models/User');
    const Notification = require('../models/Notification');
    
    const quotesCreated = [];
    
    for (const destinataireId of destinataires) {
      const quote = new QuoteRequest({
        demandeurType: 'mainteneur',
        demandeur: req.user._id,
        destinataire: destinataireId,
        equipment: intervention.equipment._id,
        site: intervention.site._id,
        type: 'corrective',
        description: description || intervention.description,
        urgence: urgence || intervention.priorite,
        intervention: intervention._id,
        messages: message ? [{
          auteur: req.user._id,
          contenu: message,
          dateEnvoi: new Date()
        }] : []
      });
      
      await quote.save();
      quotesCreated.push(quote);
      
      // Envoyer notification
      const destinataire = await User.findById(destinataireId);
      if (destinataire && destinataire.email) {
        try {
          await sendQuoteNotification(quote, destinataire);
        } catch (emailError) {
          console.error('Erreur envoi email:', emailError);
        }

        // Créer une notification in-app
        await Notification.create({
          recipient: destinataireId,
          title: 'Nouvelle demande de devis',
          message: `Vous avez reçu une demande de devis pour l'intervention sur ${intervention.equipment.nom}`,
          type: 'quote_request',
          relatedId: quote._id
        });
      }
    }
    
    res.status(201).json({
      success: true,
      data: quotesCreated,
      message: `${quotesCreated.length} demande(s) de devis créée(s)`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Créer une demande de devis depuis une intervention
// @route   POST /api/interventions/:id/quote-request
// @access  Private
exports.createQuoteRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { destinataires, description, urgence, type } = req.body;

    // Vérifier que l'intervention existe
    const intervention = await Intervention.findById(id)
      .populate('equipment', 'nom type marque modele')
      .populate('site', 'nom adresse');

    if (!intervention) {
      return res.status(404).json({
        success: false,
        message: 'Intervention non trouvée'
      });
    }

    // Vérifier que l'utilisateur a le droit de créer un devis pour cette intervention
    if (req.user.role === 'client' && intervention.site.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé à créer un devis pour cette intervention'
      });
    }

    // Générer le numéro unique
    const numero = await generateQuoteNumber(req.user.tenantId);

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
      destinataires: destinataires || [],
      site: intervention.site._id,
      equipment: intervention.equipment?._id,
      objet: `Devis pour intervention ${intervention.numero}`,
      description: description || `Demande de devis suite à l'intervention ${intervention.numero} - ${intervention.description}`,
      typeTravaux: type || 'maintenance',
      urgence: urgence || 'normale',
      statut: 'en_attente',
      dateDemande: new Date(),
      // Initialiser les réponses pour chaque destinataire
      responses: (destinataires || []).map(destId => ({
        destinataire: destId,
        statut: 'en_attente',
        dateReponse: null
      }))
    });

    await quote.save();

    // Peupler les données pour la réponse
    const populatedQuote = await Quote.findById(quote._id)
      .populate('demandeur', 'nom prenom email entreprise')
      .populate('destinataires', 'nom prenom email entreprise client')
      .populate('site', 'nom adresse')
      .populate('equipment', 'nom type');

    // Créer des notifications pour les destinataires
    for (const destId of (destinataires || [])) {
      try {
        const destinataire = populatedQuote.destinataires.find(d => d._id.toString() === destId.toString());
        if (destinataire) {
          // Créer une notification in-app
          await Notification.create({
            recipient: destId,
            title: 'Nouvelle demande de devis',
            message: `Vous avez reçu une demande de devis pour l'intervention ${intervention.numero}`,
            type: 'quote_request',
            relatedId: quote._id
          });
        }
      } catch (notifError) {
        console.error('Erreur création notification:', notifError);
      }
    }

    res.status(201).json({
      success: true,
      data: populatedQuote,
      message: 'Demande de devis créée avec succès'
    });

  } catch (error) {
    console.error('Erreur createQuoteRequest:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = exports;
