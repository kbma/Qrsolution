const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  // Identifiant multi-tenant
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  nom: {
    type: String,
    required: [true, 'Le nom de l\'équipement est requis'],
    trim: true
  },
  codeEquipement: {
    type: String,
    required: [true, 'Le code équipement est requis'],
    unique: true,
    sparse: true,
    trim: true
  },
  codeLocalisation: {
    type: String,
    required: [true, 'Le code de localisation est requis'],
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
  building: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building'
  },
  installation: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['chauffage', 'climatisation', 'ventilation', 'pompe', 'chaudiere', 'cta', 'autre'],
    required: true
  },
  categorie: {
    type: String,
    trim: true
  },
  marque: {
    type: String,
    trim: true
  },
  modele: {
    type: String,
    trim: true
  },
  numeroSerie: {
    type: String,
    sparse: true,
    trim: true
  },
  qrCode: {
    code: {
      type: String,
      required: false,
      unique: true,
      sparse: true
    },
    imageUrl: String,
    generatedAt: {
      type: Date,
      default: Date.now
    }
  },
  localisation: {
    description: String,
    etage: String,
    zone: String,
    coordonnees: {
      x: Number,
      y: Number,
      z: Number
    },
    gps: {
      latitude: Number,
      longitude: Number,
      altitude: Number
    }
  },
  caracteristiques: {
    puissance: Number,
    capacite: Number,
    tension: String,
    poids: Number,
    dimensions: {
      longueur: Number,
      largeur: Number,
      hauteur: Number
    }
  },
  dateMiseService: {
    type: Date
  },
  dateFinGarantie: {
    type: Date
  },
  etat: {
    type: String,
    enum: ['excellent', 'bon', 'moyen', 'mauvais', 'hors_service'],
    default: 'bon'
  },
  statut: {
    type: String,
    enum: ['operationnel', 'en_maintenance', 'en_panne', 'hors_service'],
    default: 'operationnel'
  },
  maintenance: {
    typeContrat: {
      type: String,
      enum: ['preventif', 'correctif', 'mixte', 'aucun'],
      default: 'aucun'
    },
    frequence: {
      type: String,
      enum: ['mensuelle', 'trimestrielle', 'semestrielle', 'annuelle']
    },
    derniereMaintenance: Date,
    prochaineMaintenance: Date,
    mainteneurResponsable: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  documents: [{
    nom: String,
    type: {
      type: String,
      enum: ['fiche_technique', 'manuel', 'certificat', 'facture', 'rapport', 'plan', 'doe', 'schema_electrique', 'schema_principe', 'fiche_intervention', 'autre']
    },
    url: String,
    mimeType: String,
    taille: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  images: [{
    url: String,
    description: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  historique: [{
    type: {
      type: String,
      enum: ['installation', 'maintenance', 'reparation', 'modification', 'deplacement']
    },
    date: Date,
    description: String,
    technicien: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    documents: [String]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  notes: String,
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
equipmentSchema.index({ site: 1, type: 1 });
equipmentSchema.index({ clientRef: 1 });
equipmentSchema.index({ qrCode: 'text' });

// Synchronisation automatique du tenantId
equipmentSchema.pre('save', async function(next) {
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

module.exports = mongoose.model('Equipment', equipmentSchema);
