const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Client = require('../models/Client');

// Protection des routes - vérification du token JWT
exports.protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Non autorisé, token manquant' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    
    if (!req.user || !req.user.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Utilisateur non trouvé ou inactif' 
      });
    }
    
    // Charger les informations du client si applicable
    if (req.user.client) {
      const ClientModel = require('../models/Client');
      req.user.clientInfo = await ClientModel.findById(req.user.client);
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false,
      message: 'Non autorisé, token invalide',
      error: error.message
    });
  }
};

// Vérification des rôles - Mise à jour pour nouveaux rôles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: `Le rôle ${req.user.role} n'est pas autorisé à accéder à cette ressource` 
      });
    }
    next();
  };
};

// Vérification des rôles legacy (pour compatibilité)
exports.authorizeLegacy = (...roles) => {
  return (req, res, next) => {
    // Nouveau rôle ou rôle legacy
    if (!roles.includes(req.user.role) && !roles.includes(req.user.roleLegacy)) {
      return res.status(403).json({ 
        success: false,
        message: `Le rôle ${req.user.role} n'est pas autorisé à accéder à cette ressource` 
      });
    }
    next();
  };
};

// Vérification de l'abonnement actif pour les clients
exports.checkSubscription = async (req, res, next) => {
  try {
    // Super Admin bypass
    if (req.user.role === 'superadmin') {
      return next();
    }
    
    if (req.user.client) {
      const ClientModel = require('../models/Client');
      const client = await ClientModel.findById(req.user.client);
      
      if (client) {
        req.clientInfo = client;
        
        // Vérifier le statut de l'abonnement
        if (client.subscription?.statut !== 'actif') {
          return res.status(403).json({ 
            success: false,
            message: 'Abonnement inactif. Veuillez contacter le support.' 
          });
        }
        
        // Vérifier la date d'expiration
        if (client.subscription?.dateExpiration && new Date() > new Date(client.subscription.dateExpiration)) {
          return res.status(403).json({ 
            success: false,
            message: 'Abonnement expiré. Veuillez renouveler votre abonnement.' 
          });
        }
      }
    }
    next();
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la vérification de l\'abonnement',
      error: error.message
    });
  }
};

// Vérification des limites d'abonnement
exports.checkLimit = (type) => {
  return async (req, res, next) => {
    try {
      if (req.user.role === 'superadmin') {
        return next();
      }
      
      if (req.clientInfo?.subscription) {
        const limits = req.clientInfo.subscription.limits;
        if (limits && limits[type] !== undefined) {
          // Cette vérification sera implémentée avec des compteurs réels
          // Pour l'instant, on laisse passer
        }
      }
      next();
    } catch (error) {
      return res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la vérification des limites',
        error: error.message
      });
    }
  };
};

// Middleware pour vérifier l'accès à une ressource spécifique
exports.checkResourceAccess = (resource) => {
  return (req, res, next) => {
    if (!req.user.hasAccess(resource, req.method.toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé à la ressource ${resource}`
      });
    }
    next();
  };
};

// Middleware pour超级管理员 bypass
exports.superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Réservé aux administrateurs'
    });
  }
  next();
};
