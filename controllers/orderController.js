const Order = require('../models/Order');
const Quote = require('../models/Quote');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');

// @desc    Obtenir toutes les commandes
// @route   GET /api/orders
// @access  Private
exports.getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, statut, client, fournisseur } = req.query;
    
    let query = {};
    
    // Filtrer par permissions (multi-tenant)
    if (req.user.role !== 'superadmin') {
      // Tous les autres rôles voient les commandes de leur tenant
      query.tenantId = req.user.tenantId;
    }
    
    // Filtres supplémentaires
    if (statut) query.statut = statut;
    if (client && req.user.role === 'superadmin') query.client = client;
    if (fournisseur && req.user.role === 'superadmin') query.fournisseur = fournisseur;
    
    const orders = await Order.find(query)
      .populate('client', 'nom prenom entreprise email')
      .populate('fournisseur', 'nom prenom entreprise email')
      .populate('quote')
      .populate('site', 'nom adresse')
      .populate('equipment', 'nom type')
      .sort({ dateCommande: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();
    
    const count = await Order.countDocuments(query);
    
    res.json({
      orders,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    console.error('Erreur get orders:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// @desc    Obtenir une commande par ID
// @route   GET /api/orders/:id
// @access  Private
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('client', 'nom prenom entreprise email telephone logo')
      .populate('fournisseur', 'nom prenom entreprise email telephone logo')
      .populate('quote')
      .populate('site')
      .populate('equipment');
    
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    
    // Vérifier les permissions (multi-tenant)
    if (req.user.role !== 'superadmin' && order.tenantId !== req.user.tenantId) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Erreur get order:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// @desc    Créer une commande depuis un devis accepté
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res) => {
  try {
    const { quoteId } = req.body;
    
    const quote = await Quote.findById(quoteId)
      .populate('demandeur')
      .populate('destinataire');
    
    if (!quote) {
      return res.status(404).json({ message: 'Devis non trouvé' });
    }
    
    if (quote.statut !== 'accepte') {
      return res.status(400).json({ message: 'Le devis doit être accepté pour créer une commande' });
    }
    
    // Vérifier les permissions (multi-tenant)
    if (req.user.role !== 'superadmin' && quote.tenantId !== req.user.tenantId) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    
    // Vérifier si une commande existe déjà pour ce devis
    const existingOrder = await Order.findOne({ quote: quoteId });
    if (existingOrder) {
      return res.status(400).json({ message: 'Une commande existe déjà pour ce devis', order: existingOrder });
    }
    
    const order = new Order({
      quote: quoteId,
      client: quote.demandeur._id,
      fournisseur: quote.destinataire._id,
      site: quote.site,
      equipment: quote.equipment,
      tenantId: quote.tenantId,
      montantHT: quote.montantHT || quote.reponse?.montant || 0,
      montantTVA: (quote.montantHT || quote.reponse?.montant || 0) * 0.20, // TVA 20%
      montantTTC: (quote.montantHT || quote.reponse?.montant || 0) * 1.20,
      devise: quote.devise,
      description: quote.description,
      conditions: quote.reponse?.conditions,
      dateDebutPrevue: quote.datePrevisionnelleTravaux,
      historique: [{
        action: 'Commande créée depuis devis accepté',
        par: req.user._id,
        details: `Devis ${quote.numero} accepté`
      }]
    });
    
    await order.save();
    
    // Mettre à jour le devis avec le numéro de commande
    quote.numeroCommande = order.numeroCommande;
    quote.dateCommande = order.dateCommande;
    await quote.save();
    
    // Envoyer notification au fournisseur
    if (quote.destinataire.email) {
      await sendEmail({
        to: quote.destinataire.email,
        subject: `Nouvelle commande ${order.numeroCommande}`,
        html: `
          <h2>Nouvelle commande</h2>
          <p>Une nouvelle commande a été créée suite à l'acceptation du devis ${quote.numero}.</p>
          <p><strong>Numéro de commande:</strong> ${order.numeroCommande}</p>
          <p><strong>Montant HT:</strong> ${order.montantHT} ${order.devise}</p>
          <p><strong>Client:</strong> ${quote.demandeur.nomComplet || quote.demandeur.entreprise}</p>
        `
      });
    }
    
    res.status(201).json(order);
  } catch (error) {
    console.error('Erreur create order:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// @desc    Mettre à jour une commande
// @route   PUT /api/orders/:id
// @access  Private
exports.updateOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    
    // Vérifier les permissions (multi-tenant)
    if (req.user.role !== 'superadmin' && order.tenantId !== req.user.tenantId) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    
    const allowedUpdates = ['statut', 'dateDebutPrevue', 'dateFinPrevue', 'notes'];
    const updates = Object.keys(req.body);
    
    updates.forEach(update => {
      if (allowedUpdates.includes(update)) {
        order[update] = req.body[update];
      }
    });
    
    // Ajouter à l'historique
    order.historique.push({
      action: 'Commande mise à jour',
      par: req.user._id,
      details: `Statut: ${order.statut}`
    });
    
    await order.save();
    
    res.json(order);
  } catch (error) {
    console.error('Erreur update order:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// @desc    Supprimer une commande
// @route   DELETE /api/orders/:id
// @access  Private (SuperAdmin only)
exports.deleteOrder = async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    
    await order.deleteOne();
    
    res.json({ message: 'Commande supprimée' });
  } catch (error) {
    console.error('Erreur delete order:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};
