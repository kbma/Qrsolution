const mongoose = require('mongoose');

const buildingSchema = new mongoose.Schema({
  // Identifiant multi-tenant
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  nom: {
    type: String,
    required: [true, 'Le nom du bâtiment est requis'],
    trim: true
  },
  code: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  site: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true
  },
  // Reference client pour filtrage rapide
  clientRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  type: {
    type: String,
    enum: ['bureau', 'production', 'stockage', 'commercial', 'residentiel', 'autre'],
    default: 'autre'
  },
  nombreEtages: {
    type: Number,
    min: 0,
    default: 1
  },
  superficie: {
    type: Number,
    min: 0
  },
  anneeConstruction: {
    type: Number,
    min: 1900,
    max: new Date().getFullYear()
  },
  installations: [{
    type: {
      type: String,
      enum: ['chaufferie', 'chaudiere', 'pompe', 'cta', 'climatisation', 'ventilation', 'autre']
    },
    nom: String,
    description: String,
    localisation: String,
    puissance: Number,
    marque: String,
    modele: String,
    dateMiseService: Date,
    documents: [{
      nom: String,
      url: String,
      type: String
    }]
  }],
  plans3D: [{
    nom: String,
    url: String,
    format: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  documents: [{
    nom: String,
    type: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  images: [{
    url: String,
    description: String
  }],
  responsables: [{
    nom: {
      type: String,
      required: true,
      trim: true
    },
    telephone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true
    },
    statut: {
      type: String,
      enum: ['actif', 'inactif'],
      default: 'actif'
    },
    photo: {
      type: String
    },
    estPrioritaire: {
      type: Boolean,
      default: false
    },
    dateAjout: {
      type: Date,
      default: Date.now
    }
  }],
  logos: {
    client: String,
    mainteneur: String,
    entrepriseExterne: String
  },
  codesSecurite: [{
    code: {
      type: String,
      required: true,
      unique: true,
      sparse: true
    },
    dateCreation: {
      type: Date,
      default: Date.now
    },
    dateValiditeDebut: Date,
    dateValiditeFin: Date,
    nombreUtilisations: {
      type: Number,
      default: 0
    },
    estActif: {
      type: Boolean,
      default: true
    },
    creePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index
buildingSchema.index({ site: 1 });
buildingSchema.index({ clientRef: 1 });

// Synchronisation automatique du tenantId
buildingSchema.pre('save', async function(next) {
  if (!this.tenantId && this.site) {
    const Site = require('./Site');
    const site = await Site.findById(this.site);
    if (site) {
      this.tenantId = site.tenantId;
      this.clientRef = site.clientRef;
    }
  }
  next();
});

module.exports = mongoose.model('Building', buildingSchema);
