const User = require('../models/User');
const Client = require('../models/Client');
const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');
const { generateToken, generateTemporaryPassword } = require('../utils/helpers');
const { getPaginationParams, buildPaginationResponse } = require('../utils/pagination');
const { sendEmail } = require('../utils/email');

// @desc    Obtenir tous les utilisateurs avec pagination
// @route   GET /api/users
// @access  Private (SuperAdmin, Client Admin)
exports.getUsers = async (req, res) => {
  try {
    let query = {};
    const { page, limit, skip } = getPaginationParams(req);
    
    // Appliquer l'isolation multi-tenant si disponible
    if (req.tenantId) {
      query.tenantId = req.tenantId;
    }
    
    // SuperAdmin voit tout
    if (req.user.role !== 'superadmin') {
      // Client Admin voit les utilisateurs de son organisation
      if (['client_admin', 'responsable_affaires'].includes(req.user.role)) {
        query.client = req.user.client;
      } else {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé'
        });
      }
    } else {
      // SuperAdmin peut filtrer par client spécifique s'il le souhaite
      if (req.query.client) {
        if (req.query.includeSubClients === 'true') {
          // Récupérer les sous-clients jusqu'à 5 niveaux
          let clientIds = [req.query.client];
          let currentLevelIds = [req.query.client];
          
          for (let i = 0; i < 5; i++) {
            const subClients = await Client.find({ parentClient: { $in: currentLevelIds } }).select('_id');
            if (subClients.length === 0) break;
            
            const subClientIds = subClients.map(c => c._id);
            clientIds = [...clientIds, ...subClientIds];
            currentLevelIds = subClientIds;
          }
          query.client = { $in: clientIds };
        } else {
          query.client = req.query.client;
        }
      }
    }
    
    // Filtrer par rôle si spécifié
    if (req.query.role) {
      query.role = req.query.role;
    }
    
    // Exclure le superadmin des résultats pour les non-superadmin
    if (req.user.role !== 'superadmin' && !req.query.role) {
      query.role = { $ne: 'superadmin' };
    }

    // Recherche
    if (req.query.search) {
      query.$or = [
        { nom: { $regex: req.query.search, $options: 'i' } },
        { prenom: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Compter total
    const total = await User.countDocuments(query);

    // Requête
    let userQuery = User.find(query)
      .select('-password')
      .populate('client', 'identiteJuridique.denomination logo')
      .sort('-createdAt');

    // Appliquer pagination
    if (limit > 0) {
      userQuery = userQuery.skip(skip).limit(limit);
    }
    
    const users = await userQuery;
    
    res.json(buildPaginationResponse(users, total, { page, limit }));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Se connecter en tant qu'un autre utilisateur (Impersonation)
// @route   POST /api/users/:id/impersonate
// @access  Private (SuperAdmin uniquement)
exports.impersonateUser = async (req, res) => {
  try {
    // Sécurité stricte : seul le SuperAdmin peut faire ça
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Action non autorisée' });
    }

    const userToImpersonate = await User.findById(req.params.id);
    if (!userToImpersonate) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Générer le token pour cet utilisateur
    const token = generateToken(userToImpersonate._id);

    res.json({
      success: true,
      data: {
        user: {
          _id: userToImpersonate._id,
          nom: userToImpersonate.nom,
          prenom: userToImpersonate.prenom,
          email: userToImpersonate.email,
          role: userToImpersonate.role,
          client: userToImpersonate.client
        },
        token
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Obtenir tous les clients (entreprises)
// @route   GET /api/clients
// @access  Private (SuperAdmin)
exports.getClients = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    const { search, status, archived } = req.query;
    
    let query = {};

    // Logique de visibilité des clients
    if (req.user.role === 'client_admin') {
      // Un client_admin voit les clients dont il est le parent (ses sous-traitants directs)
      query.parentClient = req.user.client;
    } else if (req.user.role !== 'superadmin') {
      // Les autres rôles (technicien, etc.) ne voient aucune entreprise
      return res.json(buildPaginationResponse([], 0, { page, limit }));
    }
    // Le superadmin n'a pas de filtre par défaut, il voit tout.
    // Il peut filtrer par parentClient s'il le souhaite via un query param.
    if (req.user.role === 'superadmin' && req.query.parentClient) {
      query.parentClient = req.query.parentClient;
    }

    // Filtre par statut d'archive
    if (archived === 'true') {
      query['subscription.statut'] = 'archive';
    } else {
      query['subscription.statut'] = { $ne: 'archive' };
    }

    // Filtre par statut spécifique
    if (status && status !== 'all') {
      query['subscription.statut'] = status;
    }

    // Recherche
    if (search) {
      query.$or = [
        { 'identiteJuridique.denomination': { $regex: search, $options: 'i' } },
        { 'identiteJuridique.siren': { $regex: search, $options: 'i' } },
        { 'coordonnees.email': { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Client.countDocuments(query);
    
    const clients = await Client.find(query)
      .populate('adminUser', 'nom prenom email lastLogin')
      .populate('parentClient', 'identiteJuridique.denomination logo')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);
      
    // Ajouter le nombre de sous-clients pour chaque client
    const clientsWithStats = await Promise.all(clients.map(async (client) => {
      const subClientCount = await Client.countDocuments({ parentClient: client._id });
      return {
        ...client.toObject(),
        subClientCount
      };
    }));
      
    res.json(buildPaginationResponse(clientsWithStats, total, { page, limit }));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Obtenir un client par ID avec détails complets
// @route   GET /api/clients/:id
// @access  Private (SuperAdmin)
exports.getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate('adminUser', '-password')
      .populate('creePar', 'nom prenom');

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    // Vérification des permissions
    const isOwner = req.user.role === 'client_admin' && client.parentClient?.toString() === req.user.client.toString();
    if (req.user.role !== 'superadmin' && !isOwner) {
      return res.status(403).json({ success: false, message: 'Accès refusé à cette entreprise' });
    }

    // Ajouter le nombre de sous-clients
    const subClientCount = await Client.countDocuments({ parentClient: client._id });

    res.json({ success: true, data: { ...client.toObject(), subClientCount } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Obtenir la hiérarchie d'un client (Parent et Enfants)
// @route   GET /api/clients/:id/hierarchy
// @access  Private (SuperAdmin, Client Admin)
exports.getClientHierarchy = async (req, res) => {
  try {
    const clientId = req.params.id;
    
    // 1. Récupérer le client racine
    const rootClient = await Client.findById(clientId)
      .populate('parentClient', 'identiteJuridique.denomination logo')
      .populate('adminUser', 'nom prenom email');

    if (!rootClient) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    // Vérification des permissions
    let hasAccess = false;
    if (req.user.role === 'superadmin') {
      hasAccess = true;
    } else if (req.user.role === 'client_admin') {
      // Accès autorisé si c'est ma propre entreprise ou si je suis le parent
      if (req.user.client.toString() === clientId) {
        hasAccess = true;
      } else if (rootClient.parentClient && rootClient.parentClient._id.toString() === req.user.client.toString()) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Accès refusé à cette entreprise' });
    }

    // 2. Récupérer TOUS les descendants (sous-entreprises et leurs sous-entreprises) via agrégation récursive
    const aggregation = [
      { $match: { _id: new mongoose.Types.ObjectId(clientId) } },
      {
        $graphLookup: {
          from: 'clients', // Nom de la collection dans MongoDB
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parentClient',
          as: 'descendants',
          depthField: 'level' // 0 = enfants directs, 1 = petits-enfants, etc.
        }
      }
    ];

    const result = await Client.aggregate(aggregation);
    
    let descendants = [];
    if (result.length > 0 && result[0].descendants) {
      descendants = result[0].descendants;
      
      // Populate des champs nécessaires pour l'affichage (adminUser, etc.)
      // Note: Client.populate est nécessaire car aggregate retourne des objets JS bruts
      await Client.populate(descendants, [
        { path: 'adminUser', select: 'nom prenom email' },
        { path: 'parentClient', select: 'identiteJuridique.denomination' }
      ]);

      // Fallback pour les descendants qui n'ont pas d'adminUser lié directement
      const clientsWithoutAdmin = descendants.filter(d => !d.adminUser).map(d => d._id);
      
      if (clientsWithoutAdmin.length > 0) {
        const adminUsers = await User.find({
          client: { $in: clientsWithoutAdmin },
          role: 'client_admin'
        }).select('nom prenom email client');
        
        const adminMap = {};
        adminUsers.forEach(u => {
          adminMap[u.client.toString()] = u;
        });
        
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
    }

    res.json({
      success: true,
      data: {
        client: rootClient,
        parent: rootClient.parentClient,
        descendants, // Liste complète récursive avec niveau de profondeur
        children: descendants.filter(d => d.level === 0) // Enfants directs (pour compatibilité)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mettre à jour un client
// @route   PUT /api/clients/:id
// @access  Private (SuperAdmin)
exports.updateClient = async (req, res) => {
  try {
    const clientToUpdate = await Client.findById(req.params.id);
    if (!clientToUpdate) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    // Vérification des permissions
    const isOwner = req.user.role === 'client_admin' && clientToUpdate.parentClient?.toString() === req.user.client.toString();
    if (req.user.role !== 'superadmin' && !isOwner) {
      return res.status(403).json({ success: false, message: 'Accès refusé pour modifier cette entreprise' });
    }

    let updates = { ...req.body };
    
    // Gestion du logo si uploadé
    if (req.file) {
      updates.logo = `/uploads/logos/${req.file.filename}`;
    }

    // Mise à jour du statut si demandé
    if (updates.statut) {
      if (!updates.subscription) updates.subscription = {};
      updates.subscription.statut = updates.statut;
      delete updates.statut;
    }

    // Mise à jour de l'utilisateur admin associé si fourni
    if (updates.adminUser) {
      const clientForAdmin = await Client.findById(req.params.id);
      if (clientForAdmin && clientForAdmin.adminUser) {
        const adminUpdates = {};
        if (updates.adminUser.email) adminUpdates.email = updates.adminUser.email;
        if (updates.adminUser.nom) adminUpdates.nom = updates.adminUser.nom;
        if (updates.adminUser.prenom) adminUpdates.prenom = updates.adminUser.prenom;
        if (updates.adminUser.telephone) adminUpdates.telephone = updates.adminUser.telephone;
        
        if (Object.keys(adminUpdates).length > 0) {
          await User.findByIdAndUpdate(clientForAdmin.adminUser, { $set: adminUpdates });
        }
      }
      delete updates.adminUser; // Ne pas essayer de mettre à jour ce champ dans le document Client
    }

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    res.json({
      success: true,
      data: client,
      message: 'Entreprise mise à jour avec succès'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Archiver un client
// @route   PUT /api/clients/:id/archive
// @access  Private (SuperAdmin)
exports.archiveClient = async (req, res) => {
  try {
    const clientToArchive = await Client.findById(req.params.id);
    if (!clientToArchive) {
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    // Vérification des permissions
    const isOwner = req.user.role === 'client_admin' && clientToArchive.parentClient?.toString() === req.user.client.toString();
    if (req.user.role !== 'superadmin' && !isOwner) {
      return res.status(403).json({ success: false, message: 'Accès refusé pour archiver cette entreprise' });
    }

    // Utiliser findByIdAndUpdate pour éviter les erreurs de validation sur d'autres champs
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { $set: { 'subscription.statut': 'archive' } },
      { new: true }
    );

    // Désactiver l'utilisateur admin
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

// @desc    Réinitialiser le mot de passe de l'admin d'un client
// @route   POST /api/clients/:id/reset-admin-password
// @access  Private (SuperAdmin)
exports.resetClientAdminPassword = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client || !client.adminUser) {
      return res.status(404).json({ success: false, message: 'Client ou admin introuvable' });
    }

    const isOwner = req.user.role === 'client_admin' && client.parentClient?.toString() === req.user.client.toString();
    if (req.user.role !== 'superadmin' && !isOwner) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const user = await User.findById(client.adminUser);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur admin introuvable' });
    }

    const tempPassword = generateTemporaryPassword();
    user.password = tempPassword;
    await user.save();

    if (req.body.sendEmail) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Réinitialisation de vos accès - QR Solution',
          html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>Vos identifiants ont été réinitialisés</h2><p>Email: <strong>${user.email}</strong></p><p>Mot de passe: <strong>${tempPassword}</strong></p></div>`
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

// @desc    Obtenir un utilisateur par ID
// @route   GET /api/users/:id
// @access  Private
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('client', 'identiteJuridique logo')
      .populate('affectations.site', 'nom adresse');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Vérifier l'accès multi-tenant
    if (req.tenantId && user.tenantId !== req.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé à cet utilisateur'
      });
    }
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Créer un utilisateur (membre de l'organisation)
// @route   POST /api/users
// @access  Private (Client Admin uniquement)
exports.createUser = async (req, res) => {
  try {
    // Vérifier les permissions
    if (!['client_admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes pour créer un utilisateur'
      });
    }
    
    // Vérifier les limites d'abonnement si client migré
    if (req.clientInfo) {
      const userCount = await User.countDocuments({ client: req.user.client });
      if (req.clientInfo.subscription?.limites?.utilisateurs && 
          userCount >= req.clientInfo.subscription.limites.utilisateurs) {
        return res.status(403).json({
          success: false,
          message: 'Limite d\'utilisateurs atteinte pour votre abonnement'
        });
      }
    }
    
    // Vérifier si l'email existe déjà
    const existingUser = await User.findOne({ email: req.body.email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Un utilisateur avec cet email existe déjà'
      });
    }
    
    // Générer un mot de passe temporaire
    const temporaryPassword = generateTemporaryPassword();
    
    // Préparer les données de l'utilisateur
    const userData = {
      nom: req.body.nom,
      prenom: req.body.prenom,
      email: req.body.email.toLowerCase(),
      password: temporaryPassword,
      telephone: req.body.telephone,
      role: req.body.role || 'technicien',
      client: req.user.client,
      tenantId: req.tenantId,
      createdBy: req.user._id
    };
    
    // Vérifier que le rôle est valide pour un utilisateur interne
    const validInternalRoles = ['client_admin', 'responsable_affaires', 'technicien'];
    if (!validInternalRoles.includes(userData.role)) {
      return res.status(400).json({
        success: false,
        message: 'Rôle non valide pour un utilisateur interne'
      });
    }
    
    const user = new User(userData);
    await user.save();
    
    // Générer le token JWT
    const token = generateToken(user._id);
    
    res.status(201).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          nom: user.nom,
          prenom: user.prenom,
          email: user.email,
          role: user.role,
          client: user.client
        },
        temporaryPassword,
        token
      },
      message: 'Utilisateur créé avec succès. Un mot de passe temporaire a été généré.'
    });
  } catch (error) {
    console.error('Erreur dans createUser:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la création de l\'utilisateur'
    });
  }
};

// @desc    Créer un partenaire (mainteneur externe ou sous-traitant)
// @route   POST /api/users/partner
// @access  Private (Client Admin uniquement)
exports.createPartner = async (req, res) => {
  try {
    // Vérifier les permissions
    if (!['client_admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes pour créer un partenaire'
      });
    }
    
    // Vérifier si l'email existe déjà
    const existingUser = await User.findOne({ email: req.body.email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Un utilisateur avec cet email existe déjà'
      });
    }
    
    // Générer un mot de passe temporaire
    const temporaryPassword = generateTemporaryPassword();
    
    // Préparer les données du partenaire
    const partnerData = {
      nom: req.body.nom,
      prenom: req.body.prenom,
      email: req.body.email.toLowerCase(),
      password: temporaryPassword,
      telephone: req.body.telephone,
      role: req.body.role, // 'mainteneur_externe' ou 'sous_traitant'
      entreprise: req.body.entreprise, // Nom de l'entreprise partenaire
      specialite: req.body.specialite,
      client: req.user.client,
      tenantId: req.tenantId,
      createdBy: req.user._id,
      siteAccess: req.body.siteAccess || []
    };
    
    // Vérifier que le rôle est valide pour un partenaire
    const validPartnerRoles = ['mainteneur_externe', 'sous_traitant'];
    if (!validPartnerRoles.includes(partnerData.role)) {
      return res.status(400).json({
        success: false,
        message: 'Rôle non valide pour un partenaire'
      });
    }
    
    const user = new User(partnerData);
    await user.save();
    
    // Générer le token JWT
    const token = generateToken(user._id);
    
    res.status(201).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          nom: user.nom,
          prenom: user.prenom,
          email: user.email,
          role: user.role,
          entreprise: user.entreprise,
          client: user.client
        },
        temporaryPassword,
        token
      },
      message: 'Partenaire créé avec succès. Un mot de passe temporaire a été généré.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Créer un client complet (entreprise avec informations juridiques)
// @route   POST /api/clients
// @access  Private (SuperAdmin uniquement pour l'instant)
exports.createClient = async (req, res) => {
  try {
    // Vérifier les permissions - SuperAdmin ou Client Admin peuvent créer des clients
    if (!['superadmin', 'client_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes pour créer un client'
      });
    }
    
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
      responsablesLegaux: req.body.responsablesLegaux || [],
      logo: req.body.logo,
      subscription: {
        plan: req.body.subscription?.plan || 'STARTER',
        statut: 'actif',
        dateDebut: new Date(),
        dateExpiration: req.body.subscription?.dateExpiration || 
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 an par défaut
        limites: {
          utilisateurs: req.body.subscription?.limites?.utilisateurs || 5,
          sites: req.body.subscription?.limites?.sites || 10,
          equipements: req.body.subscription?.limites?.equipements || 100,
          interventionsMois: req.body.subscription?.limites?.interventionsMois || 50
        }
      },
      creePar: req.user._id,
    };

    // Si un client_admin crée un client, il devient le parent
    if (req.user.role === 'client_admin') {
      clientData.parentClient = req.user.client;
    }
    
    const client = new Client(clientData);
    await client.save();
    
    // Créer l'utilisateur admin du client (Gérant)
    if (req.body.adminUser) {
      const adminPassword = generateTemporaryPassword();
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
      
      // Lier le client à l'utilisateur pour compatibilité
      client.adminUser = adminUser._id;
      await client.save();
      
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
            temporaryPassword: adminPassword
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
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Mettre à jour un utilisateur
// @route   PUT /api/users/:id
// @access  Private
exports.updateUser = async (req, res) => {
  try {
    let user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Vérifier l'accès multi-tenant
    if (req.tenantId && user.tenantId !== req.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé à cet utilisateur'
      });
    }
    
    // Vérifier les permissions
    const canUpdate = req.user.role === 'superadmin' || 
                      (req.user.role === 'client_admin' && user.client?.toString() === req.user.client?.toString());
    
    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes'
      });
    }
    
    // Champs modifiables
    const allowedUpdates = ['nom', 'prenom', 'telephone', 'role', 'siteAccess', 'specialite', 'entreprise', 'identification', 'login', 'password'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    // Appliquer les mises à jour
    Object.keys(updates).forEach(key => {
      user[key] = updates[key];
    });
    
    // Sauvegarder pour déclencher les hooks (notamment le hash du mot de passe)
    await user.save();
    
    // Recharger l'utilisateur sans le mot de passe
    user = await User.findById(req.params.id).select('-password');
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Désactiver/Activer un utilisateur
// @route   PUT /api/users/:id/toggle-active
// @access  Private (Client Admin, SuperAdmin)
exports.toggleUserActive = async (req, res) => {
  try {
    let user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Vérifier l'accès multi-tenant
    if (req.tenantId && user.tenantId !== req.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé à cet utilisateur'
      });
    }
    
    // Vérifier les permissions
    const canToggle = req.user.role === 'superadmin' || 
                     (req.user.role === 'client_admin' && user.client?.toString() === req.user.client?.toString());
    
    if (!canToggle) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes'
      });
    }
    
    user.isActive = !user.isActive;
    await user.save();
    
    res.json({
      success: true,
      data: user,
      message: `Utilisateur ${user.isActive ? 'activé' : 'désactivé'} avec succès`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Supprimer un utilisateur
// @route   DELETE /api/users/:id
// @access  Private (SuperAdmin uniquement)
exports.deleteUser = async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Seul le Super Admin peut supprimer des utilisateurs'
      });
    }
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    await user.deleteOne();
    
    res.json({
      success: true,
      message: 'Utilisateur supprimé avec succès'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Obtenir les statistiques des utilisateurs
// @route   GET /api/users/stats
// @access  Private
exports.getUsersStats = async (req, res) => {
  try {
    let matchQuery = {};
    
    if (req.tenantId) {
      matchQuery.tenantId = req.tenantId;
    }
    
    if (req.user.role !== 'superadmin') {
      matchQuery.client = req.user.client;
    }
    
    const stats = await User.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$role',
          total: { $sum: 1 },
          actifs: { $sum: { $cond: ['$isActive', 1, 0] } },
          inactifs: { $sum: { $cond: ['$isActive', 0, 1] } }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Obtenir le profil de l'utilisateur connecté
// @route   GET /api/users/profile/me
// @access  Private
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('client', 'identiteJuridique logo branding');

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Mettre à jour le profil de l'utilisateur connecté
// @route   PUT /api/users/profile/me
// @access  Private
exports.updateMyProfile = async (req, res) => {
  try {
    const { nom, prenom, telephone, preferences } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Mettre à jour les champs autorisés
    if (nom) user.nom = nom;
    if (prenom) user.prenom = prenom;
    if (telephone) user.telephone = telephone;
    if (preferences) user.preferences = { ...user.preferences, ...preferences };

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('client', 'identiteJuridique logo branding');

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      data: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Changer le mot de passe de l'utilisateur connecté
// @route   PUT /api/users/profile/change-password
// @access  Private
exports.changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez fournir l\'ancien et le nouveau mot de passe'
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier l'ancien mot de passe
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mot de passe actuel incorrect'
      });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    user.isFirstLogin = false;
    await user.save();

    res.json({
      success: true,
      message: 'Mot de passe changé avec succès'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Réinitialiser le mot de passe d'un utilisateur (Super Admin uniquement)
// @route   POST /api/users/:id/reset-password
// @access  Private (SuperAdmin uniquement)
exports.resetUserPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Générer un mot de passe temporaire
    const tempPassword = generateTemporaryPassword();
    
    user.password = tempPassword;
    user.isFirstLogin = true;
    await user.save();

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
      data: {
        tempPassword,
        userId: user._id,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Réinitialiser son propre mot de passe (utilisateur connecté)
// @route   POST /api/users/reset-my-password
// @access  Private
exports.resetMyPassword = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Générer un nouveau mot de passe temporaire
    const newPassword = generateTemporaryPassword();

    user.password = newPassword;
    user.isFirstLogin = true;
    await user.save();

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
      data: {
        password: newPassword,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
