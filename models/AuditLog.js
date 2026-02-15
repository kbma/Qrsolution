const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Identifiant multi-tenant
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  // Utilisateur auteur de l'action
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Informations sur l'utilisateur
  userEmail: String,
  userRole: String,
  userName: String,
  
  // Type d'action
  action: {
    type: String,
    enum: [
      'create',
      'read',
      'update',
      'delete',
      'login',
      'logout',
      'export',
      'import',
      'approve',
      'reject',
      'assign',
      'unassign',
      'activate',
      'deactivate'
    ],
    required: true
  },
  
  // Ressource affectée
  ressource: {
    type: String,
    enum: [
      'user',
      'client',
      'site',
      'building',
      'equipment',
      'intervention',
      'quote',
      'order',
      'document',
      'report',
      'settings',
      'subscription',
      'auth'
    ],
    required: true
  },
  
  // ID de la ressource (si applicable)
  ressourceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  
  // Nom de la ressource (pour affichage)
  ressourceName: String,
  
  // Détails de l'action
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Valeurs précédentes (pour les mises à jour)
  previousValues: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Nouvelles valeurs (pour les mises à jour)
  newValues: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Métadonnées
  metadata: {
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    requestId: String,
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'webhook', 'system'],
      default: 'web'
    }
  },
  
  // Statut de l'action
  status: {
    type: String,
    enum: ['success', 'failure', 'pending'],
    default: 'success'
  },
  
  // Message d'erreur (si échec)
  errorMessage: String,
  
  // Code HTTP (pour les actions API)
  httpCode: Number
}, {
  timestamps: true
});

// Index pour optimisation des requêtes
auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, action: 1 });
auditLogSchema.index({ tenantId: 1, ressource: 1 });
auditLogSchema.index({ tenantId: 1, user: 1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ ressource: 1, ressourceId: 1 });

// Méthode statique pour créer une entrée de log
auditLogSchema.statics.log = async function(data) {
  try {
    const log = new this(data);
    await log.save();
    return log;
  } catch (error) {
    console.error('Erreur lors de la création du log d\'audit:', error);
    return null;
  }
};

// Méthode pour créer un log de connexion
auditLogSchema.statics.logLogin = async function(user, ipAddress, userAgent, success = true, errorMessage = null) {
  return this.log({
    tenantId: user.tenantId || 'SYSTEM',
    user: user._id,
    userEmail: user.email,
    userRole: user.role,
    userName: `${user.prenom} ${user.nom}`,
    action: success ? 'login' : 'login',
    ressource: 'auth',
    metadata: {
      ipAddress,
      userAgent,
      source: userAgent?.includes('Mobile') ? 'mobile' : 'web'
    },
    status: success ? 'success' : 'failure',
    errorMessage
  });
};

// Méthode pour créer un log de création
auditLogSchema.statics.logCreate = async function(user, ressource, ressourceId, ressourceName, details = {}) {
  return this.log({
    tenantId: user.tenantId,
    user: user._id,
    userEmail: user.email,
    userRole: user.role,
    userName: `${user.prenom} ${user.nom}`,
    action: 'create',
    ressource,
    ressourceId,
    ressourceName,
    details,
    newValues: details,
    status: 'success'
  });
};

// Méthode pour créer un log de mise à jour
auditLogSchema.statics.logUpdate = async function(user, ressource, ressourceId, ressourceName, previousValues, newValues) {
  return this.log({
    tenantId: user.tenantId,
    user: user._id,
    userEmail: user.email,
    userRole: user.role,
    userName: `${user.prenom} ${user.nom}`,
    action: 'update',
    ressource,
    ressourceId,
    ressourceName,
    previousValues,
    newValues,
    details: {
      changedFields: Object.keys(newValues)
    },
    status: 'success'
  });
};

// Méthode pour créer un log de suppression
auditLogSchema.statics.logDelete = async function(user, ressource, ressourceId, ressourceName) {
  return this.log({
    tenantId: user.tenantId,
    user: user._id,
    userEmail: user.email,
    userRole: user.role,
    userName: `${user.prenom} ${user.nom}`,
    action: 'delete',
    ressource,
    ressourceId,
    ressourceName,
    status: 'success'
  });
};

// Méthode pour créer un log de lecture
auditLogSchema.statics.logRead = async function(user, ressource, ressourceId, ressourceName) {
  return this.log({
    tenantId: user.tenantId,
    user: user._id,
    userEmail: user.email,
    userRole: user.role,
    userName: `${user.prenom} ${user.nom}`,
    action: 'read',
    ressource,
    ressourceId,
    ressourceName,
    status: 'success'
  });
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
