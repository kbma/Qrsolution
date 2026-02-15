const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  // Identifiant multi-tenant
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  numero: {
    type: String,
    required: true,
    unique: true
  },
  demandeur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  typeDemandeur: {
    type: String,
    enum: ['client', 'mainteneur'],
    required: true
  },
  destinataire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  destinataires: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  logoSociete: {
    type: String
  },
  nomSociete: {
    type: String,
    trim: true
  },
  // Reference client pour filtrage rapide
  clientRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  site: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site'
  },
  equipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipment'
  },
  objet: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  typeTravaux: {
    type: String,
    enum: ['maintenance', 'reparation', 'installation', 'remplacement', 'autre'],
    required: true
  },
  urgence: {
    type: String,
    enum: ['normale', 'haute', 'urgente'],
    default: 'normale'
  },
  montantHT: {
    type: Number,
    min: 0,
    default: 0
  },
  montantTVA: {
    type: Number,
    min: 0,
    default: 0
  },
  montantTTC: {
    type: Number,
    min: 0,
    default: 0
  },
  devise: {
    type: String,
    default: 'EUR'
  },
  dateDemande: {
    type: Date,
    default: Date.now
  },
  dateExpiration: {
    type: Date
  },
  dateReponseAttendue: {
    type: Date
  },
  datePrevisionnelleTravaux: {
    type: Date
  },
  statut: {
    type: String,
    enum: ['en_attente', 'recu', 'en_cours', 'soumis', 'accepte', 'refuse', 'expire'],
    default: 'en_attente'
  },
  numeroCommande: {
    type: String,
    unique: true,
    sparse: true
  },
  dateCommande: {
    type: Date
  },
  reponse: {
    description: String,
    montant: Number,
    devise: {
      type: String,
      default: 'TND'
    },
    delai: String,
    validiteDevis: Date,
    conditions: String,
    documentUrl: String,
    dateReponse: Date,
    modificationsDemandees: String
  },
  validation: {
    validePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dateValidation: Date,
    commentaire: String,
    statut: {
      type: String,
      enum: ['en_attente', 'approuve', 'rejete']
    }
  },
  validationClient: {
    requise: {
      type: Boolean,
      default: false
    },
    validePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dateValidation: Date,
    commentaire: String,
    statut: {
      type: String,
      enum: ['en_attente', 'approuve', 'rejete']
    }
  },
  // Réponses des destinataires (pour devis multi-destinataires)
  responses: [{
    destinataire: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    statut: {
      type: String,
      enum: ['en_attente', 'vu', 'reponse_envoyee', 'demande_infos', 'refuse', 'accepte'],
      default: 'en_attente'
    },
    montantHT: {
      type: Number,
      min: 0
    },
    devise: {
      type: String,
      default: 'EUR'
    },
    delai: String,
    validiteDevis: Date,
    conditions: String,
    message: String,
    documentUrl: String,
    dateReponse: {
      type: Date,
      default: Date.now
    },
    dateConsultation: {
      type: Date
    },
    modificationsDemandees: String
  }],
  documents: [{
    nom: String,
    url: String,
    type: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  piecesSuplementaires: {
    photos: [{
      url: String,
      description: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    autresDocuments: [{
      nom: String,
      url: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  traceabilite: {
    pdfUrl: String,
    excelUrl: String,
    generatedAt: Date
  },
  consultations: [{
    consultePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dateConsultation: {
      type: Date,
      default: Date.now
    },
    notificationEnvoyee: {
      type: Boolean,
      default: false
    }
  }],
  historique: [{
    action: String,
    date: {
      type: Date,
      default: Date.now
    },
    par: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    details: String
  }],
  notes: String
}, {
  timestamps: true
});

// Index
quoteSchema.index({ clientRef: 1, statut: 1 });
quoteSchema.index({ demandeur: 1 });
quoteSchema.index({ createdAt: -1 });

// Générer numéro de devis automatiquement
quoteSchema.pre('save', async function(next) {
  // Synchroniser tenantId depuis le demandeur ou le site
  if (!this.tenantId) {
    if (this.demandeur) {
      const User = require('./User');
      const user = await User.findById(this.demandeur);
      if (user && user.tenantId) {
        this.tenantId = user.tenantId;
      }
    }
    if (!this.tenantId && this.site) {
      const Site = require('./Site');
      const site = await Site.findById(this.site);
      if (site) {
        this.tenantId = site.tenantId;
        this.clientRef = site.clientRef;
      }
    }
  }
  
  if (!this.numero) {
    const count = await this.constructor.countDocuments();
    const date = new Date();
    this.numero = `DEV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}-${String(count + 1).padStart(5, '0')}`;
  }
  
  // Générer numéro de commande automatiquement si le devis est accepté
  if (this.statut === 'accepte' && !this.numeroCommande) {
    const Order = require('./Order');
    const orderCount = await Order.countDocuments();
    const date = new Date();
    this.numeroCommande = `CMD-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}-${String(orderCount + 1).padStart(5, '0')}`;
    this.dateCommande = new Date();
  }
  
  next();
});

module.exports = mongoose.model('Quote', quoteSchema);
