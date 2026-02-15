const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  // Identifiant unique multi-tenant
  tenantId: {
    type: String,
    unique: true,
    index: true
  },
  
  // Identité Juridique
  identiteJuridique: {
    denomination: {
      type: String,
      required: true,
      trim: true
    },
    formeJuridique: {
      type: String,
      enum: ['SARL', 'SA', 'SAS', 'SASU', 'EURL', 'SCI', 'EI', 'EPIC', 'AUTRE'],
      default: 'SARL'
    },
    siren: {
      type: String,
      required: true,
      unique: true,
      sparse: true
    },
    siret: {
      type: String,
      required: true,
      unique: true,
      sparse: true
    },
    numeroTVA: {
      type: String,
      trim: true
    },
    rcs: {
      ville: String,
      numero: String
    },
    dateInscriptionRCS: Date,
    capitalSocial: {
      type: Number,
      default: 0
    }
  },
  
  // Coordonnées
  coordonnees: {
    adresse: {
      rue: String,
      ville: String,
      codePostal: String,
      pays: {
        type: String,
        default: 'France'
      }
    },
    telephone: String,
    email: {
      type: String,
      lowercase: true,
      trim: true
    },
    siteWeb: String
  },
  
  // Responsables Légaux
  responsablesLegaux: [{
    nom: {
      type: String,
      required: false
    },
    prenom: {
      type: String,
      required: false
    },
    fonction: {
      type: String,
      enum: ['Gérant', 'Président', 'Président Directeur Général', 'Directrice Générale', 'Directeur Général', 'Associé', 'Représentant Légal', 'AUTRE'],
      default: 'Gérant'
    },
    email: String,
    telephone: String,
    estPrincipal: {
      type: Boolean,
      default: false
    },
    dateDebutFonction: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Logo et Branding
  logo: {
    type: String
  },
  branding: {
    couleurPrincipale: {
      type: String,
      default: '#007bff'
    },
    couleurSecondaire: {
      type: String,
      default: '#6c757d'
    }
  },
  
  // Abonnement
  subscription: {
    plan: {
      type: String,
      enum: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'],
      default: 'STARTER'
    },
    statut: {
      type: String,
      enum: ['actif', 'inactif', 'expiré', 'suspendu', 'archive', 'annule'],
      default: 'actif'
    },
    dateDebut: Date,
    dateExpiration: Date,
    limites: {
      utilisateurs: {
        type: Number,
        default: 5
      },
      sites: {
        type: Number,
        default: 10
      },
      equipements: {
        type: Number,
        default: 100
      },
      interventionsMois: {
        type: Number,
        default: 50
      }
    }
  },
  
  // Préférences
  preferences: {
    devise: {
      type: String,
      default: 'EUR'
    },
    formatDate: {
      type: String,
      default: 'DD/MM/YYYY'
    },
    fuseauHoraire: {
      type: String,
      default: 'Europe/Paris'
    },
    langue: {
      type: String,
      default: 'fr'
    }
  },
  
  // Statut
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Métadonnées
  parentClient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    index: true
  },
  creePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index composés
clientSchema.index({ isActive: 1 });
clientSchema.index({ 'subscription.statut': 1 });

// Générer tenantId avant sauvegarde
clientSchema.pre('save', function(next) {
  if (!this.tenantId) {
    this.tenantId = 'TNT-' + Date.now().toString(36).toUpperCase() + 
                   Math.random().toString(36).substring(2, 6).toUpperCase();
  }
  next();
});

// Méthode pour vérifier si l'abonnement est expiré
clientSchema.methods.isSubscriptionExpired = function() {
  if (!this.subscription?.dateExpiration) return false;
  return new Date() > new Date(this.subscription.dateExpiration);
};

// Méthode pour vérifier si l'abonnement est actif
clientSchema.methods.isSubscriptionActive = function() {
  return this.isActive && 
         this.subscription?.statut === 'actif' && 
         !this.isSubscriptionExpired();
};

// Méthode pour vérifier les limites
clientSchema.methods.hasReachedLimit = function(type) {
  if (!this.subscription?.limites) return false;
  
  // Cette méthode sera implémentée avec les compteurs réels
  return false;
};

module.exports = mongoose.model('Client', clientSchema);
