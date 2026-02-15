const Client = require('../models/Client');
const User = require('../models/User');
const mongoose = require('mongoose');
const { generateTemporaryPassword, generateToken } = require('../utils/helpers');
const { getPaginationParams, buildPaginationResponse } = require('../utils/pagination');
const { sendEmail } = require('../utils/email');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// @desc    Obtenir tous les clients avec pagination
// @route   GET /api/clients
// @access  Private (SuperAdmin uniquement)
exports.getClients = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    
    let query = {};
    
    // Recherche
    if (req.query.search) {
      query['identiteJuridique.denomination'] = { 
        $regex: req.query.search, 
        $options: 'i' 
      };
    }
    
    // Filtrer par statut
    if (req.query.archived === 'true') {
      query['subscription.statut'] = 'archive';
    } else {
      query['subscription.statut'] = { $ne: 'archive' };
      
      if (req.query.statut && req.query.statut !== 'all') {
        query['subscription.statut'] = req.query.statut;
      }
    }
    
    // Filtrer par plan
    if (req.query.plan) {
      query['subscription.plan'] = req.query.plan;
    }
    
    // Compter total
    const total = await Client.countDocuments(query);
    
    // Requête avec infos complètes
    let clientQuery = Client.find(query)
      .sort('-createdAt');
    
    // Appliquer pagination
    if (limit > 0) {
      clientQuery = clientQuery.skip(skip).limit(limit);
    }
    
    const clients = await clientQuery;
    
    // --- OPTIMISATION (N+1 Problem) ---
    // 1. Récupérer les IDs des clients
    const clientIds = clients.map(client => client._id);

    // 2. Récupérer tous les admins pour ces clients en une seule requête
    const adminUsers = await User.find({
      client: { $in: clientIds },
      role: 'client_admin'
    }).select('nom prenom email telephone role isActive lastLogin client');

    // 3. Créer une map pour un accès rapide
    const adminUserMap = adminUsers.reduce((map, user) => {
      map[user.client.toString()] = user;
      return map;
    }, {});

    // 4. Combiner les données
    const clientsWithAdmin = clients.map(client => ({
      ...client.toObject(),
      adminUser: adminUserMap[client._id.toString()] || null
    }));
    
    res.json(buildPaginationResponse(clientsWithAdmin, total, { page, limit }));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Obtenir un client par ID
// @route   GET /api/clients/:id
// @access  Private (SuperAdmin uniquement)
exports.getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate('creePar', 'nom prenom email')
      .populate('adminUser', '-password');
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }
    
    // Si adminUser n'est pas peuplé (ancien format), le chercher manuellement
    let adminUser = client.adminUser;
    if (!adminUser) {
      adminUser = await User.findOne({ client: client._id, role: 'client_admin' }).select('-password');
    }

    // Compter les utilisateurs du client
    const userCount = await User.countDocuments({ client: client._id });
    
    // Compter les sites du client
    const siteCount = await require('../models/Site').countDocuments({ clientRef: client._id });
    
    res.json({
      success: true,
      data: {
        ...client.toObject(),
        adminUser,
        stats: {
          utilisateurs: userCount,
          sites: siteCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Obtenir la hiérarchie d'un client (Parent et Enfants récursifs)
// @route   GET /api/clients/:id/hierarchy
// @access  Private (SuperAdmin, Client Admin)
exports.getClientHierarchy = async (req, res) => {
  try {
    const clientId = req.params.id;
    
    // 1. Récupérer le client racine
    let rootClient = await Client.findById(clientId)
      .populate('parentClient', 'identiteJuridique.denomination logo')
      .populate('adminUser', 'nom prenom email');

    if (!rootClient) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    // Fallback pour trouver l'admin si le lien direct est manquant
    if (!rootClient.adminUser) {
      const adminUser = await User.findOne({ client: rootClient._id, role: 'client_admin' }).select('nom prenom email');
      if (adminUser) {
        rootClient = rootClient.toObject(); // Convertir en objet simple pour pouvoir le modifier
        rootClient.adminUser = adminUser;
      }
    }

    // 2. Vérification des permissions
    let hasAccess = false;
    if (req.user.role === 'superadmin') {
      hasAccess = true;
    } else if (req.user.role === 'client_admin') {
      const parentId = rootClient.parentClient?._id || rootClient.parentClient;
      if (req.user.client.toString() === clientId || (parentId && parentId.toString() === req.user.client.toString())) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Accès refusé à cette hiérarchie' });
    }

    // 3. Récupérer TOUS les descendants via agrégation récursive
    const aggregation = [
      { $match: { _id: new mongoose.Types.ObjectId(clientId) } },
      {
        $graphLookup: {
          from: 'clients',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parentClient',
          as: 'descendants',
          depthField: 'level'
        }
      }
    ];

    const result = await Client.aggregate(aggregation);
    
    let descendants = (result.length > 0 && result[0].descendants) ? result[0].descendants : [];
      
    // 4. Populate des champs nécessaires pour l'affichage
    await Client.populate(descendants, [
      { path: 'adminUser', select: 'nom prenom email' },
      { path: 'parentClient', select: 'identiteJuridique.denomination' }
    ]);

    // Fallback pour les descendants qui n'ont pas d'adminUser lié
    const clientsWithoutAdminIds = descendants.filter(d => !d.adminUser).map(d => d._id);
    if (clientsWithoutAdminIds.length > 0) {
      const adminUsers = await User.find({ client: { $in: clientsWithoutAdminIds }, role: 'client_admin' }).select('nom prenom email client');
      const adminMap = adminUsers.reduce((map, user) => ({ ...map, [user.client.toString()]: user }), {});
      descendants.forEach(d => {
        if (!d.adminUser && adminMap[d._id.toString()]) {
          d.adminUser = adminMap[d._id.toString()];
        }
      });
    }
      
    // Trier par niveau hiérarchique puis par nom
    descendants.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return (a.identiteJuridique?.denomination || '').localeCompare(b.identiteJuridique?.denomination || '');
    });

    res.json({
      success: true,
      data: {
        client: rootClient,
        parent: rootClient.parentClient,
        descendants,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Créer un client complet avec informations juridiques
// @route   POST /api/clients
// @access  Private (SuperAdmin uniquement)
exports.createClient = async (req, res) => {
  try {
    // Vérifier si le SIREN existe déjà
    const existingClient = await Client.findOne({
      'identiteJuridique.siren': req.body.identiteJuridique.siren
    });
    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: 'Un client avec ce SIREN existe déjà'
      });
    }
    
    // Vérifier si le SIRET existe déjà
    if (req.body.identiteJuridique.siret) {
      const existingSiret = await Client.findOne({
        'identiteJuridique.siret': req.body.identiteJuridique.siret
      });
      if (existingSiret) {
        return res.status(400).json({
          success: false,
          message: 'Un client avec ce SIRET existe déjà'
        });
      }
    }
    
    // Créer le client
    const clientData = {
      tenantId: 'TNT-' + Date.now().toString(36).toUpperCase() + 
               Math.random().toString(36).substring(2, 6).toUpperCase(),
      identiteJuridique: {
        denomination: req.body.identiteJuridique.denomination,
        formeJuridique: req.body.identiteJuridique.formeJuridique || 'SARL',
        siren: req.body.identiteJuridique.siren,
        siret: req.body.identiteJuridique.siret,
        numeroTVA: req.body.identiteJuridique.numeroTVA,
        rcs: {
          ville: req.body.identiteJuridique.rcs?.ville,
          numero: req.body.identiteJuridique.rcs?.numero
        },
        dateInscriptionRCS: req.body.identiteJuridique.dateInscriptionRCS,
        capitalSocial: req.body.identiteJuridique.capitalSocial || 0
      },
      coordonnees: {
        adresse: req.body.coordonnees?.adresse,
        telephone: req.body.coordonnees?.telephone,
        email: req.body.coordonnees?.email,
        siteWeb: req.body.coordonnees?.siteWeb
      },
      responsablesLegaux: (req.body.responsablesLegaux || []).filter(r => r && (r.nom || r.prenom)),
      logo: req.body.logo,
      branding: req.body.branding || {
        couleurPrincipale: '#007bff',
        couleurSecondaire: '#6c757d'
      },
      subscription: {
        plan: req.body.subscription?.plan || 'STARTER',
        statut: 'actif',
        dateDebut: new Date(),
        dateExpiration: req.body.subscription?.dateExpiration || 
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        limites: {
          utilisateurs: req.body.subscription?.limites?.utilisateurs || 5,
          sites: req.body.subscription?.limites?.sites || 10,
          equipements: req.body.subscription?.limites?.equipements || 100,
          interventionsMois: req.body.subscription?.limites?.interventionsMois || 50
        }
      },
      preferences: req.body.preferences || {
        devise: 'EUR',
        formatDate: 'DD/MM/YYYY',
        fuseauHoraire: 'Europe/Paris',
        langue: 'fr'
      },
      creePar: req.user._id
    };
    
    const client = new Client(clientData);
    await client.save();
    
    // Créer l'utilisateur admin du client (Gérant)
    if (req.body.adminUser) {
      // Utiliser le mot de passe fourni ou en générer un temporaire
      const adminPassword = req.body.adminUser.password || generateTemporaryPassword();
      
      const adminUser = new User({
        nom: req.body.adminUser.nom,
        prenom: req.body.adminUser.prenom,
        email: req.body.adminUser.email.toLowerCase(),
        password: adminPassword,
        telephone: req.body.adminUser.telephone,
        role: 'client_admin',
        client: client._id,
        tenantId: client.tenantId,
        createdBy: req.user._id
      });
      await adminUser.save();
      
      // Générer token
      const token = generateToken(adminUser._id);
      
      res.status(201).json({
        success: true,
        data: {
          client,
          adminUser: {
            _id: adminUser._id,
            nom: adminUser.nom,
            prenom: adminUser.prenom,
            email: adminUser.email,
            role: adminUser.role,
            temporaryPassword: adminPassword,
            token
          }
        },
        message: 'Client et utilisateur admin créés avec succès'
      });
    } else {
      res.status(201).json({
        success: true,
        data: client,
        message: 'Client créé avec succès'
      });
    }
  } catch (error) {
    console.error('Erreur dans createClient:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Mettre à jour un client
// @route   PUT /api/clients/:id
// @access  Private (SuperAdmin uniquement)
exports.updateClient = async (req, res) => {
  try {
    let client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }
    
    // Champs modifiables
    const allowedUpdates = [
      'identiteJuridique',
      'coordonnees',
      'responsablesLegaux',
      'logo',
      'branding',
      'subscription',
      'preferences',
      'isActive'
    ];
    
    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    // Gestion du logo si uploadé via le formulaire de modification
    if (req.file) {
      // Supprimer l'ancien logo si existant
      if (client.logo) {
        const oldLogoPath = path.join(__dirname, '..', client.logo.replace('/uploads/', 'uploads/'));
        if (fs.existsSync(oldLogoPath)) {
          try { fs.unlinkSync(oldLogoPath); } catch (e) {}
        }
      }
      updates.logo = `/uploads/logos/${req.file.filename}`;
    }

    // Gestion spécifique du changement de statut
    if (req.body.statut) {
      updates['subscription.statut'] = req.body.statut;
    }
    
    client = await Client.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });
    
    res.json({
      success: true,
      data: client,
      message: 'Client mis à jour avec succès'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Archiver un client
// @route   PUT /api/clients/:id/archive
// @access  Private (SuperAdmin uniquement)
exports.archiveClient = async (req, res) => {
  try {
    // Utiliser findByIdAndUpdate pour éviter les erreurs de validation sur d'autres champs
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { $set: { 'subscription.statut': 'archive' } },
      { new: true }
    );

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    // Désactiver l'utilisateur admin associé
    let adminUserId = client.adminUser;
    if (!adminUserId) {
      const adminUser = await User.findOne({ client: client._id, role: 'client_admin' });
      if (adminUser) adminUserId = adminUser._id;
    }
    
    if (adminUserId) {
      await User.findByIdAndUpdate(adminUserId, { isActive: false });
    }

    res.json({ success: true, data: client, message: 'Entreprise archivée avec succès' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Exporter les clients en Excel
// @route   GET /api/clients/export/excel
// @access  Private (SuperAdmin)
exports.exportClients = async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    let query = {};
    if (req.query.search) {
      query['identiteJuridique.denomination'] = { $regex: req.query.search, $options: 'i' };
    }
    if (req.query.archived === 'true') {
      query['subscription.statut'] = 'archive';
    } else {
      query['subscription.statut'] = { $ne: 'archive' };
      if (req.query.statut && req.query.statut !== 'all') {
        query['subscription.statut'] = req.query.statut;
      }
    }

    const clients = await Client.find(query).sort('-createdAt');
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Clients');
    
    worksheet.columns = [
      { header: 'Dénomination', key: 'denomination', width: 30 },
      { header: 'SIREN', key: 'siren', width: 15 },
      { header: 'Email Contact', key: 'email', width: 25 },
      { header: 'Téléphone', key: 'telephone', width: 15 },
      { header: 'Plan', key: 'plan', width: 15 },
      { header: 'Statut', key: 'statut', width: 12 },
      { header: 'Date Création', key: 'createdAt', width: 15 }
    ];
    
    clients.forEach(client => {
      worksheet.addRow({
        denomination: client.identiteJuridique?.denomination,
        siren: client.identiteJuridique?.siren,
        email: client.coordonnees?.email,
        telephone: client.coordonnees?.telephone,
        plan: client.subscription?.plan,
        statut: client.subscription?.statut,
        createdAt: new Date(client.createdAt).toLocaleDateString('fr-FR')
      });
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="clients.xlsx"');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Réinitialiser le mot de passe de l'admin d'un client
// @route   POST /api/clients/:id/reset-admin-password
// @access  Private (SuperAdmin uniquement)
exports.resetClientAdminPassword = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client introuvable' });
    }

    // Trouver l'admin du client
    // On cherche soit par le champ adminUser du client, soit par recherche inverse
    let user;
    if (client.adminUser) {
      user = await User.findById(client.adminUser);
    }
    
    if (!user) {
      user = await User.findOne({ client: client._id, role: 'client_admin' });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur admin introuvable pour ce client' });
    }

    const tempPassword = generateTemporaryPassword();
    user.password = tempPassword;
    await user.save();

    if (req.body.sendEmail) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Réinitialisation de vos accès - QR Solution',
          html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>Vos identifiants ont été réinitialisés</h2><p>Entreprise : <strong>${client.identiteJuridique?.denomination}</strong></p><p>Email: <strong>${user.email}</strong></p><p>Nouveau mot de passe: <strong>${tempPassword}</strong></p></div>`
        });
      } catch (err) { console.error('Erreur email:', err); }
    }

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé',
      data: { email: user.email, password: tempPassword }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Supprimer un client
// @route   DELETE /api/clients/:id
// @access  Private (SuperAdmin uniquement)
exports.deleteClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }
    
    // Vérifier que le client n'a pas de données associées
    const userCount = await User.countDocuments({ client: client._id });
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de supprimer ce client car il possède des utilisateurs'
      });
    }
    
    await client.deleteOne();
    
    res.json({
      success: true,
      message: 'Client supprimé avec succès'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Obtenir les statistiques des clients
// @route   GET /api/clients/stats/summary
// @access  Private (SuperAdmin uniquement)
exports.getClientStats = async (req, res) => {
  try {
    const stats = await Client.aggregate([
      {
        $group: {
          _id: '$subscription.statut',
          total: { $sum: 1 }
        }
      }
    ]);
    
    const planStats = await Client.aggregate([
      {
        $group: {
          _id: '$subscription.plan',
          total: { $sum: 1 }
        }
      }
    ]);
    
    const totalClients = await Client.countDocuments();
    const activeClients = await Client.countDocuments({ 
      'subscription.statut': 'actif' 
    });
    
    res.json({
      success: true,
      data: {
        total: totalClients,
        actifs: activeClients,
        parStatut: stats,
        parPlan: planStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Upload logo pour un client
// @route   POST /api/clients/:id/logo
// @access  Private (SuperAdmin uniquement)
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    // Supprimer l'ancien logo s'il existe
    if (client.logo) {
      const oldLogoPath = path.join(__dirname, '..', client.logo.replace('/uploads/', 'uploads/'));
      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
    }

    // Mettre à jour avec le nouveau logo
    client.logo = `/uploads/logos/${req.file.filename}`;
    await client.save();

    res.json({
      success: true,
      message: 'Logo uploadé avec succès',
      data: client
    });
  } catch (error) {
    console.error('Erreur uploadLogo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// @desc    Réinitialiser le mot de passe de l'admin d'un client
// @route   POST /api/clients/:id/reset-admin-password
// @access  Private (SuperAdmin uniquement)
exports.resetClientAdminPassword = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    if (!client.adminUser) {
      return res.status(400).json({ success: false, message: 'Ce client n\'a pas d\'utilisateur administrateur' });
    }

    // Générer un nouveau mot de passe
    const newPassword = generateTemporaryPassword();

    // Mettre à jour le mot de passe de l'utilisateur admin
    const adminUser = await User.findById(client.adminUser);
    if (!adminUser) {
      return res.status(404).json({ success: false, message: 'Utilisateur administrateur non trouvé' });
    }

    adminUser.password = newPassword;
    await adminUser.save();

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
      data: {
        email: adminUser.email,
        password: newPassword
      }
    });
  } catch (error) {
    console.error('Erreur resetClientAdminPassword:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// @desc    Supprimer logo d'un client
// @route   DELETE /api/clients/:id/logo
// @access  Private (SuperAdmin uniquement)
exports.deleteLogo = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    // Supprimer le fichier
    if (client.logo) {
      const logoPath = path.join(__dirname, '..', client.logo.replace('/uploads/', 'uploads/'));
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    }

    client.logo = null;
    await client.save();

    res.json({
      success: true,
      message: 'Logo supprimé avec succès',
      data: client
    });
  } catch (error) {
    console.error('Erreur deleteLogo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
