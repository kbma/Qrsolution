const Site = require('../models/Site');
const Subscription = require('../models/Subscription');
const Building = require('../models/Building');
const Equipment = require('../models/Equipment');
const Intervention = require('../models/Intervention');
const { generateSecurityCode } = require('../utils/helpers');
const { geocodeAddress, reverseGeocode, validateCoordinates } = require('../utils/geocoding');
const { tenantIsolation, applyTenantFilter } = require('../middleware/tenantIsolation');
const fs = require('fs');
const path = require('path');

// @desc    Obtenir tous les sites avec pagination
// @route   GET /api/sites
// @access  Private
exports.getSites = async (req, res) => {
  try {
    let query = {};
    const { page = 1, limit = 10, search } = req.query;
    
    // Appliquer l'isolation multi-tenant si disponible
    if (req.tenantId) {
      query.tenantId = req.tenantId;
      
      // Les partenaires ont des accès limités aux sites
      if (['mainteneur_externe', 'sous_traitant', 'technicien'].includes(req.user.role)) {
        const siteIds = req.user.siteAccess?.map(a => a.site) || [];
        if (siteIds.length > 0) {
          query._id = { $in: siteIds };
        } else {
          // Pas d'accès à des sites
          return res.status(200).json({
            success: true,
            data: [],
            pagination: {
              page: 1,
              limit: 10,
              total: 0,
              pages: 0
            }
          });
        }
      }
    }
    
    // Superadmin peut filtrer par client
    if (req.user.role === 'superadmin' && req.query.client) {
      query.clientRef = req.query.client;
    }
    
    // Recherche
    if (search) {
      query.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { 'adresse.ville': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = limit === 'all' ? 0 : Math.max(1, parseInt(limit));
    const skip = limitNum > 0 ? (pageNum - 1) * limitNum : 0;
    
    // Compter total
    const total = await Site.countDocuments(query);
    
    // Requête
    let siteQuery = Site.find(query)
      .populate('client', 'nom prenom email')
      .populate('clientRef', 'identiteJuridique.denomination logo')
      .sort('-createdAt');
    
    // Appliquer pagination
    if (limitNum > 0) {
      siteQuery = siteQuery.skip(skip).limit(limitNum);
    }
    
    const sites = await siteQuery;
    
    res.status(200).json({
      success: true,
      data: sites,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: limitNum > 0 ? Math.ceil(total / limitNum) : 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des sites',
      error: error.message
    });
  }
};

// @desc    Obtenir un site par ID
// @route   GET /api/sites/:id
// @access  Private
exports.getSite = async (req, res) => {
  try {
    const site = await Site.findById(req.params.id)
      .populate('client', 'nom prenom email telephone')
      .populate('clientRef', 'identiteJuridique logo branding');
    
    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site non trouvé'
      });
    }
    
    // Vérifier l'accès multi-tenant si activé
    if (req.tenantId && site.tenantId !== req.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé à ce site'
      });
    }
    
    // Vérifier l'accès partenaire au site
    if (req.tenantId && ['mainteneur_externe', 'sous_traitant'].includes(req.user.role)) {
      const hasAccess = req.user.hasSiteAccess?.(site._id) || false;
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Accès refusé à ce site'
        });
      }
    }
    
    // Récupérer les statistiques du site (bâtiments, équipements, interventions)
    const [batiments, equipements, interventions] = await Promise.all([
      Building.countDocuments({ site: site._id }),
      Equipment.countDocuments({ site: site._id }),
      Intervention.countDocuments({ site: site._id })
    ]);

    const siteData = site.toObject();
    siteData.stats = { batiments, equipements, interventions };

    res.status(200).json({
      success: true,
      data: siteData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du site',
      error: error.message
    });
  }
};

// @desc    Créer un site
// @route   POST /api/sites
// @access  Private (Client Admin, Responsable Affaire)
exports.createSite = async (req, res) => {
  try {
    // Vérifier les permissions
    if (!req.user.hasAccess('sites', 'write')) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes pour créer un site'
      });
    }
    
    // Vérifier les limites d'abonnement si client migré
    if (req.user.client && req.clientInfo) {
      const Client = require('../models/Client');
      const client = await Client.findById(req.user.client);
      if (client) {
        const siteCount = await Site.countDocuments({ clientRef: req.user.client });
        if (client.subscription?.limites?.sites && siteCount >= client.subscription.limites.sites) {
          return res.status(403).json({
            success: false,
            message: 'Limite de sites atteinte pour votre abonnement'
          });
        }
      }
    }
    
    // Générer le code de sécurité
    const codeSecurite = generateSecurityCode();
    req.body.codeSecurite = codeSecurite;
    // Date de validation du code (par défaut 1 an)
    req.body.dateExpirationCode = req.body.dateExpirationCode || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    
    // Assigner le client et le tenantId si disponible
    req.body.clientRef = req.user.client;
    if (req.tenantId) {
      req.body.tenantId = req.tenantId;
    }
    req.body.client = req.user._id;
    
    // Géocodage de l'adresse
    if (req.body.adresse?.adresseComplete) {
      try {
        const geoResult = await geocodeAddress(req.body.adresse.adresseComplete);
        if (geoResult) {
          req.body.coordonnees = {
            latitude: geoResult.latitude,
            longitude: geoResult.longitude
          };
          req.body.location = {
            type: 'Point',
            coordinates: [geoResult.longitude, geoResult.latitude]
          };
        }
      } catch (geoError) {
        console.error('Erreur de géocodage:', geoError);
      }
    }
    
    const site = new Site(req.body);
    await site.save();
    
    res.status(201).json({
      success: true,
      data: site
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du site',
      error: error.message
    });
  }
};

// @desc    Exporter les sites en Excel
// @route   GET /api/sites/export/excel
// @access  Private
exports.exportSites = async (req, res) => {
  try {
    let query = {};
    if (req.tenantId) query.tenantId = req.tenantId;
    if (req.user.role === 'superadmin' && req.query.client) query.clientRef = req.query.client;
    if (req.query.search) {
      query.$or = [
        { nom: { $regex: req.query.search, $options: 'i' } },
        { 'adresse.ville': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const sites = await Site.find(query).populate('client', 'nom prenom email');
    
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sites');
    
    worksheet.columns = [
      { header: 'Nom', key: 'nom', width: 20 },
      { header: 'Ville', key: 'ville', width: 15 },
      { header: 'Adresse', key: 'adresse', width: 30 },
      { header: 'Responsable', key: 'client', width: 20 },
      { header: 'Date Création', key: 'createdAt', width: 15 }
    ];
    
    sites.forEach(site => {
      worksheet.addRow({
        nom: site.nom,
        ville: site.adresse?.ville,
        adresse: site.adresse?.adresseComplete || `${site.adresse?.rue || ''} ${site.adresse?.ville || ''}`,
        client: site.client ? `${site.client.prenom} ${site.client.nom}` : 'N/A',
        createdAt: new Date(site.createdAt).toLocaleDateString('fr-FR')
      });
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sites.xlsx"');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Uploader des photos pour un site
// @route   POST /api/sites/:id/photos
// @access  Private
exports.uploadPhotos = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune photo uploadée' });
    }
    
    const site = await Site.findById(req.params.id);
    if (!site) return res.status(404).json({ success: false, message: 'Site non trouvé' });
    
    const photos = req.files.map(file => ({
      url: `/uploads/sites/${file.filename}`,
      nom: file.originalname,
      uploadedAt: new Date(),
      uploadedBy: req.user._id
    }));
    
    if (!site.photos) site.photos = [];
    site.photos.push(...photos);
    
    await site.save();
    
    res.json({ success: true, data: site.photos, message: 'Photos ajoutées' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Supprimer une photo d'un site
// @route   DELETE /api/sites/:id/photos/:photoId
// @access  Private
exports.deletePhoto = async (req, res) => {
  try {
    const { id, photoId } = req.params;
    const site = await Site.findById(id);
    if (!site) return res.status(404).json({ success: false, message: 'Site non trouvé' });
    
    if (!site.photos) site.photos = [];
    const photoIndex = site.photos.findIndex(p => p._id.toString() === photoId);
    if (photoIndex === -1) return res.status(404).json({ success: false, message: 'Photo non trouvée' });
    
    const photo = site.photos[photoIndex];
    // const filePath = path.join(__dirname, '../../', photo.url);
    // if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    
    site.photos.splice(photoIndex, 1);
    await site.save();
    
    res.json({ success: true, message: 'Photo supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Uploader des documents pour un site
// @route   POST /api/sites/:id/documents
// @access  Private
exports.uploadDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun document uploadé' });
    }
    
    const site = await Site.findById(req.params.id);
    if (!site) return res.status(404).json({ success: false, message: 'Site non trouvé' });
    
    const documents = req.files.map(file => ({
      url: `/uploads/sites/documents/${file.filename}`,
      nom: file.originalname,
      type: 'autre', // Valeur par défaut pour éviter l'erreur de validation
      uploadedAt: new Date(),
      uploadedBy: req.user._id
    }));
    
    if (!site.documents) site.documents = [];
    site.documents.push(...documents);
    
    await site.save();
    
    res.json({ success: true, data: site.documents, message: 'Documents ajoutés' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Supprimer un document d'un site
// @route   DELETE /api/sites/:id/documents/:docId
// @access  Private
exports.deleteDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const site = await Site.findById(id);
    if (!site) return res.status(404).json({ success: false, message: 'Site non trouvé' });
    
    if (!site.documents) site.documents = [];
    const docIndex = site.documents.findIndex(d => d._id.toString() === docId);
    if (docIndex === -1) return res.status(404).json({ success: false, message: 'Document non trouvé' });
    
    // Note: Suppression physique du fichier possible ici avec fs.unlink
    
    site.documents.splice(docIndex, 1);
    await site.save();
    
    res.json({ success: true, message: 'Document supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mettre à jour un site
// @route   PUT /api/sites/:id
// @access  Private
exports.updateSite = async (req, res) => {
  try {
    let site = await Site.findById(req.params.id);
    
    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site non trouvé'
      });
    }
    
    // Vérifier l'accès multi-tenant si activé
    if (req.tenantId && site.tenantId !== req.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé à ce site'
      });
    }
    
    // Vérifier les permissions
    if (!req.user.hasAccess('sites', 'write')) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes pour modifier ce site'
      });
    }
    
    // Mise à jour des coordonnées si adresse modifiée
    if (req.body.adresse?.adresseComplete && !req.body.coordonnees) {
      try {
        const geoResult = await geocodeAddress(req.body.adresse.adresseComplete);
        if (geoResult) {
          req.body.coordonnees = {
            latitude: geoResult.latitude,
            longitude: geoResult.longitude
          };
          req.body.location = {
            type: 'Point',
            coordinates: [geoResult.longitude, geoResult.latitude]
          };
        }
      } catch (geoError) {
        console.error('Erreur de géocodage:', geoError);
      }
    }
    
    site = await Site.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    res.status(200).json({
      success: true,
      data: site
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du site',
      error: error.message
    });
  }
};

// @desc    Supprimer un site
// @route   DELETE /api/sites/:id
// @access  Private (Client Admin uniquement)
exports.deleteSite = async (req, res) => {
  try {
    const site = await Site.findById(req.params.id);
    
    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site non trouvé'
      });
    }
    
    // Vérifier l'accès multi-tenant si activé
    if (req.tenantId && site.tenantId !== req.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé à ce site'
      });
    }
    
    // Vérifier les permissions - Suppression réservée aux admins
    if (req.user.role !== 'superadmin' && req.user.role !== 'client_admin') {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes pour supprimer ce site'
      });
    }
    
    // Supprimer tous les bâtiments associés au site
    const Building = require('../models/Building');
    await Building.deleteMany({ site: site._id });
    
    await site.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Site et ses bâtiments supprimés avec succès'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du site',
      error: error.message
    });
  }
};

// @desc    Obtenir les statistiques des sites
// @route   GET /api/sites/stats
// @access  Private
exports.getSitesStats = async (req, res) => {
  try {
    let matchQuery = {};
    
    // Appliquer l'isolation multi-tenant si disponible
    if (req.tenantId) {
      matchQuery.tenantId = req.tenantId;
    }
    
    const stats = await Site.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          actifs: { $sum: { $cond: ['$isActive', 1, 0] } },
          inactifs: { $sum: { $cond: ['$isActive', 0, 1] } }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: stats[0] || { total: 0, actifs: 0, inactifs: 0 }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
};
