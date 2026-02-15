const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Référence au client (obligatoire pour tous sauf Super Admin)
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: function() {
      return this.role !== 'superadmin';
    }
  },
  
  // tenantId pour filtrage rapide
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  // Informations personnelles
  nom: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true
  },
  prenom: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: 8,
    select: false
  },
  telephone: {
    type: String,
    trim: true
  },
  
  // Identifiant et login personnalisés
  identification: {
    type: String,
    trim: true,
    sparse: true
  },
  login: {
    type: String,
    trim: true,
    sparse: true
  },
  
  // Rôle utilisateur - Nouvelle structure hiérarchique
  role: {
    type: String,
    enum: [
      'superadmin',
      'client_admin',
      'responsable_affaires',
      'technicien',
      'mainteneur_externe',
      'sous_traitant'
    ],
    default: 'technicien'
  },
  
  // Rôle legacy (pour compatibilité)
  roleLegacy: {
    type: String,
    enum: ['superadmin', 'client', 'mainteneur_interne', 'mainteneur_externe', 'technicien', 'gerant', 'responsable_affaires'],
    default: undefined
  },
  
  // Droits d'accès spécifiques
  permissions: [{
    ressource: {
      type: String,
      enum: ['sites', 'buildings', 'equipment', 'interventions', 'quotes', 'users', 'partners', 'reports']
    },
    action: {
      type: String,
      enum: ['read', 'write', 'delete', 'admin']
    }
  }],
  
  // Accès aux sites (pour partenaires)
  siteAccess: [{
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site'
    },
    acces: {
      type: String,
      enum: ['lecture', 'ecriture', 'complet'],
      default: 'lecture'
    },
    // Optionnel : origine de cet accès (devis accepté)
    viaQuote: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quote'
    }
  }],
  
  
  // Anciens champs (pour migration)
  entreprise: String,
  identiteJuridique: {
    denomination: String,
    formeJuridique: String,
    siren: String,
    siret: String,
    numeroTVA: String,
    rcs: String,
    dateInscriptionRCS: Date,
    capitalSocial: Number,
    responsablesLegaux: [{
      nom: String,
      prenom: String,
      fonction: String
    }]
  },
  logo: String,
  
  // Statut
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Avatar et personnalisation
  avatar: String,
  
  // Sécurité
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastLogin: Date,
  loginCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index composés pour performance
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ client: 1, role: 1 });
userSchema.index({ isActive: 1 });

// Relations avec Client pour synchroniser tenantId
userSchema.pre('save', async function(next) {
  if (this.isModified('client') && this.client) {
    const Client = require('./Client');
    const client = await Client.findById(this.client);
    if (client) {
      this.tenantId = client.tenantId;
    }
  }
  next();
});

// Hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Méthode pour comparer les mots de passe
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Méthode pour obtenir le nom complet
userSchema.virtual('nomComplet').get(function() {
  return `${this.prenom} ${this.nom}`;
});

// Méthode pour vérifier si l'utilisateur a accès à une ressource
userSchema.methods.hasAccess = function(ressource, action) {
  // Super Admin a toujours accès
  if (this.role === 'superadmin') return true;
  
  // Si des permissions spécifiques sont définies
  if (this.permissions && this.permissions.length > 0) {
    const perm = this.permissions.find(p => p.ressource === ressource);
    if (perm) {
      if (perm.action === 'admin') return true;
      if (perm.action === action) return true;
      if (perm.action === 'write' && (action === 'read' || action === 'write')) return true;
    }
    return false;
  }
  
  // Permissions par défaut basées sur le rôle
  const defaultPermissions = {
    'client_admin': ['sites', 'buildings', 'equipment', 'interventions', 'quotes', 'users', 'partners', 'reports'],
    'responsable_affaires': ['sites', 'buildings', 'equipment', 'interventions', 'quotes', 'users'],
    'technicien': ['sites', 'equipment', 'interventions'],
    'mainteneur_externe': ['sites', 'equipment', 'interventions'],
    'sous_traitant': ['sites', 'interventions']
  };
  
  const allowedRessources = defaultPermissions[this.role] || [];
  return allowedRessources.includes(ressource);
};

// Méthode pour vérifier l'accès à un site (pour partenaires)
userSchema.methods.hasSiteAccess = function(siteId) {
  // Super Admin et client_admin ont accès à tous les sites
  if (this.role === 'superadmin' || this.role === 'client_admin') {
    return true;
  }
  
  // Vérifier les accès spécifiques
  if (this.siteAccess && this.siteAccess.length > 0) {
    const access = this.siteAccess.find(a => a.site.toString() === siteId.toString());
    return !!access;
  }
  
  return false;
};

module.exports = mongoose.model('User', userSchema);
