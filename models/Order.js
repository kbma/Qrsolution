const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // Identifiant multi-tenant
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  numeroCommande: {
    type: String,
    required: true,
    unique: true
  },
  quote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quote',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fournisseur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  site: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site'
  },
  equipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipment'
  },
  montantHT: {
    type: Number,
    required: true,
    min: 0
  },
  montantTVA: {
    type: Number,
    default: 0,
    min: 0
  },
  montantTTC: {
    type: Number,
    required: true,
    min: 0
  },
  devise: {
    type: String,
    default: 'EUR'
  },
  dateCommande: {
    type: Date,
    default: Date.now
  },
  dateDebutPrevue: {
    type: Date
  },
  dateFinPrevue: {
    type: Date
  },
  statut: {
    type: String,
    enum: ['validee', 'en_preparation', 'en_cours', 'terminee', 'annulee'],
    default: 'validee'
  },
  description: {
    type: String
  },
  conditions: {
    type: String
  },
  documents: [{
    nom: String,
    url: String,
    type: String,
    uploadedAt: {
      type: Date,
      default: Date.now
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

// Générer numéro de commande automatiquement
orderSchema.pre('save', async function(next) {
  if (!this.numeroCommande) {
    const count = await this.constructor.countDocuments();
    const date = new Date();
    this.numeroCommande = `CMD-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
