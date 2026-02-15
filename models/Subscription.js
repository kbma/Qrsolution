const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom de l\'abonnement est requis'],
    trim: true
  },
  type: {
    type: String,
    enum: ['basique', 'standard', 'premium', 'entreprise'],
    default: 'basique'
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dateDebut: {
    type: Date,
    default: Date.now
  },
  dateFin: {
    type: Date,
    required: true
  },
  limites: {
    nombreSites: {
      type: Number,
      default: 5
    },
    nombreEquipements: {
      type: Number,
      default: 50
    },
    nombreMainteneurs: {
      type: Number,
      default: 3
    },
    stockageGo: {
      type: Number,
      default: 5
    }
  },
  utilisation: {
    nombreSites: {
      type: Number,
      default: 0
    },
    nombreEquipements: {
      type: Number,
      default: 0
    },
    nombreMainteneurs: {
      type: Number,
      default: 0
    },
    stockageUtilise: {
      type: Number,
      default: 0
    }
  },
  prix: {
    type: Number,
    required: true
  },
  devise: {
    type: String,
    default: 'TND'
  },
  statut: {
    type: String,
    enum: ['actif', 'suspendu', 'expire', 'resilie'],
    default: 'actif'
  },
  paiements: [{
    date: Date,
    montant: Number,
    methode: String,
    reference: String
  }],
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Vérifier si l'abonnement est expiré
subscriptionSchema.methods.isExpired = function() {
  return new Date() > this.dateFin;
};

// Vérifier si une limite est atteinte
subscriptionSchema.methods.hasReachedLimit = function(type) {
  switch(type) {
    case 'sites':
      return this.utilisation.nombreSites >= this.limites.nombreSites;
    case 'equipements':
      return this.utilisation.nombreEquipements >= this.limites.nombreEquipements;
    case 'mainteneurs':
      return this.utilisation.nombreMainteneurs >= this.limites.nombreMainteneurs;
    case 'stockage':
      return this.utilisation.stockageUtilise >= this.limites.stockageGo;
    default:
      return false;
  }
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
