const mongoose = require('mongoose');

const quoteRequestSchema = new mongoose.Schema({
  // Identification
  numero: {
    type: String,
    unique: true,
    required: true
  },
  
  // Demandeur
  demandeurType: {
    type: String,
    enum: ['client', 'mainteneur', 'technicien'],
    required: true
  },
  demandeur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Destinataire
  destinataire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Entreprise extérieure optionnelle
  entrepriseExterieure: {
    nom: String,
    contact: String,
    email: String,
    telephone: String
  },
  
  // Équipement et site concernés
  equipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipment'
  },
  site: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true
  },
  building: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building'
  },
  
  // Détails de la demande
  type: {
    type: String,
    enum: ['preventive', 'corrective', 'revision', 'installation', 'autre'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  urgence: {
    type: String,
    enum: ['basse', 'normale', 'haute', 'critique'],
    default: 'normale'
  },
  
  // Statut
  statut: {
    type: String,
    enum: ['brouillon', 'envoyee', 'accepte', 'rejetee', 'en_cours', 'completee', 'annulee'],
    default: 'brouillon'
  },
  
  // Devis
  devis: {
    numero: String,
    montant: Number,
    devise: {
      type: String,
      default: 'TND'
    },
    description: String,
    dateValidite: Date,
    documents: [{
      nom: String,
      url: String,
      uploadedAt: Date
    }]
  },
  
  // Validation
  validations: [{
    par: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    date: Date,
    statut: {
      type: String,
      enum: ['approuve', 'rejete'],
      required: true
    },
    commentaire: String
  }],
  
  // Suivi
  dateDebut: Date,
  dateFin: Date,
  technicienAssigne: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Documents
  documents: [{
    nom: String,
    type: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Communications
  messages: [{
    auteur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    contenu: String,
    dateEnvoi: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Notes internes
  notes: String,
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Auto-générer le numéro de demande
quoteRequestSchema.pre('save', async function(next) {
  if (!this.numero) {
    const count = await mongoose.model('QuoteRequest').countDocuments();
    this.numero = `DEV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Index pour performance
quoteRequestSchema.index({ demandeur: 1, statut: 1 });
quoteRequestSchema.index({ destinataire: 1, statut: 1 });
quoteRequestSchema.index({ site: 1, dateCreated: 1 });

module.exports = mongoose.model('QuoteRequest', quoteRequestSchema);
