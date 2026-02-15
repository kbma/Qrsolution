const mongoose = require('mongoose');

const interventionSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['preventive', 'corrective', 'urgence', 'inspection'],
    required: true
  },
  titre: {
    type: String,
    required: [true, 'Le titre est requis'],
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  equipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipment',
    required: true
  },
  // Reference client pour filtrage rapide
  clientRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  site: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true
  },
  priorite: {
    type: String,
    enum: ['basse', 'normale', 'haute', 'urgente'],
    default: 'normale'
  },
  statut: {
    type: String,
    enum: ['planifiee', 'en_cours', 'terminee', 'annulee', 'reportee'],
    default: 'planifiee'
  },
  datePrevu: {
    type: Date,
    required: true
  },
  dateDebut: Date,
  dateFin: Date,
  heureDebutCancellable: Date,
  dureeEstimee: {
    type: Number,
    min: 0
  },
  dureeReelle: {
    type: Number,
    min: 0
  },
  techniciens: [{
    technicien: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['responsable', 'assistant'],
      default: 'assistant'
    }
  }],
  diagnosticInitial: {
    description: String,
    photos: [String],
    date: Date
  },
  travauxEffectues: {
    description: String,
    photos: [String],
    pieceChangees: [{
      designation: String,
      reference: String,
      quantite: Number,
      cout: Number
    }],
    consommables: [{
      designation: String,
      quantite: Number
    }]
  },
  resultat: {
    description: String,
    equipementFonctionnel: Boolean,
    recommandations: String,
    photos: [String]
  },
  rapport: {
    url: String,
    generatedAt: Date
  },
  couts: {
    mainOeuvre: {
      type: Number,
      default: 0
    },
    pieces: {
      type: Number,
      default: 0
    },
    deplacement: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    }
  },
  signature: {
    technicien: {
      url: String,
      date: Date
    },
    client: {
      url: String,
      nom: String,
      date: Date
    }
  },
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index
interventionSchema.index({ site: 1, statut: 1 });
interventionSchema.index({ clientRef: 1 });
interventionSchema.index({ createdAt: -1 });

// Générer numéro d'intervention automatiquement
interventionSchema.pre('save', async function(next) {
  // Synchroniser tenantId depuis le site
  if (!this.tenantId && this.site) {
    const Site = require('./Site');
    const site = await Site.findById(this.site);
    if (site) {
      this.tenantId = site.tenantId;
      this.clientRef = site.clientRef;
    }
  }
  
  if (!this.numero) {
    const count = await this.constructor.countDocuments();
    const date = new Date();
    this.numero = `INT-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}-${String(count + 1).padStart(5, '0')}`;
  }
  
  if (this.couts) {
    this.couts.total = (this.couts.mainOeuvre || 0) + 
                       (this.couts.pieces || 0) + 
                       (this.couts.deplacement || 0);
  }
  
  next();
});

module.exports = mongoose.model('Intervention', interventionSchema);
