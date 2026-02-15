const mongoose = require('mongoose');

// Vérification et isolation du tenant
exports.tenantIsolation = async (req, res, next) => {
  try {
    // Super Admin bypass l'isolation
    if (req.user && req.user.role === 'superadmin') {
      req.tenantFilter = {}; // Pas de filtre = accès à tout
      req.tenantId = null;
      return next();
    }
    
    // Si pas d'utilisateur ou pas de rôle
    if (!req.user || !req.user.role) {
      return next(); // Laissez passer pour l'instant
    }
    
    // Récupérer le tenantId de l'utilisateur
    let tenantId = req.user?.tenantId;
    
    // Si pas de tenantId direct, essayer de le récupérer depuis le client
    if (!tenantId && req.user?.client) {
      const Client = mongoose.model('Client');
      const client = await Client.findById(req.user.client);
      if (client) {
        tenantId = client.tenantId || client._id.toString(); // Utiliser _id comme fallback
        console.log(`[TENANT] Client ${client._id}: tenantId=${client.tenantId || 'non défini, utilisation de _id'}`);
      }
    }
    
    // Si toujours pas de tenantId, autoriser l'accès mais avec un avertissement
    if (!tenantId) {
      console.warn(`[TENANT] ⚠️ Utilisateur ${req.user.email} n'a pas de tenantId - accès limité`);
      req.tenantFilter = {};
      req.tenantId = req.user.tenantId || null;
      return next();
    }
    
    // Appliquer le filtre tenantId
    req.tenantFilter = { tenantId: tenantId };
    req.tenantId = tenantId;
    console.log(`[TENANT] ✅ Accès restreint au tenant: ${tenantId}`);
    
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Erreur d\'isolation tenant',
      error: error.message
    });
  }
};

// Appliquer le filtre tenantId aux requêtes par modèle
exports.applyTenantFilter = (modelName) => {
  return async (req, res, next) => {
    // Super Admin bypass
    if (req.user?.role === 'superadmin') {
      return next();
    }
    
    // Si pas de tenantId, ne pas appliquer de filtre
    if (!req.tenantId) {
      return next();
    }
    
    try {
      const Model = mongoose.model(modelName);
      
      // Si c'est une création, ajouter automatiquement tenantId
      if (req.method === 'POST') {
        req.body.tenantId = req.tenantId;
      }
      
      // Si c'est une lecture avec ID, vérifier l'appartenance
      if (req.params.id) {
        const doc = await Model.findOne({
          _id: req.params.id,
          ...req.tenantFilter
        });
        
        if (!doc) {
          return res.status(403).json({
            success: false,
            message: 'Accès refusé à cette ressource'
          });
        }
        req.document = doc; // Passer le document au contrôleur
      }
      
      // Ajouter le filtre tenantId aux requêtes de liste
      if (!req.query.tenantId) {
        req.query = { ...req.query, ...req.tenantFilter };
      }
      
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Erreur de vérification d'accès pour ${modelName}`,
        error: error.message
      });
    }
  };
};

// Middleware pour vérifier l'accès à un site spécifique (pour partenaires)
exports.checkSiteAccess = (action = 'lecture') => {
  return async (req, res, next) => {
    // Super Admin et client_admin bypass
    if (['superadmin', 'client_admin'].includes(req.user?.role)) {
      return next();
    }
    
    // Pas de tenantId, bypass temporaire
    if (!req.tenantId) {
      return next();
    }
    
    // Récupérer l'ID du site depuis la requête
    const siteId = req.params.siteId || req.body.site || req.query.siteId;
    
    if (!siteId) {
      return next(); // Pas de site spécifié, on laisse le contrôleur gérer
    }
    
    try {
      const hasAccess = req.user.hasSiteAccess?.(siteId) || false;
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Accès refusé à ce site'
        });
      }
      
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Erreur de vérification d\'accès au site',
        error: error.message
      });
    }
  };
};

// Middleware pour ajouter le filtre tenantId aux Agrégations
exports.tenantAggregation = (modelName) => {
  return async (req, res, next) => {
    // Super Admin bypass
    if (req.user?.role === 'superadmin') {
      return next();
    }
    
    // Si pas de tenantId, bypass
    if (!req.tenantId) {
      return next();
    }
    
    // Ajouter le match tenantId au début du pipeline
    if (req.tenantId) {
      req.aggregationPipeline = req.aggregationPipeline || [];
      req.aggregationPipeline.unshift({
        $match: { tenantId: req.tenantId }
      });
    }
    
    next();
  };
};

// Helper pour créer des requêtes filtrées par tenant
exports.createTenantQuery = (Model, req) => {
  if (req.user?.role === 'superadmin') {
    return {};
  }
  if (!req.tenantId) {
    return {}; // Pas encore migré
  }
  return { tenantId: req.tenantId };
};

// Helper pour populate avec vérification tenant
exports.tenantPopulate = async (Model, docId, req) => {
  if (req.user?.role === 'superadmin') {
    return await Model.findById(docId);
  }
  if (!req.tenantId) {
    return await Model.findById(docId); // Pas encore migré
  }
  return await Model.findOne({ _id: docId, tenantId: req.tenantId });
};
