const mongoose = require('mongoose');

const siteSchema = new mongoose.Schema({
  // Identifiant multi-tenant
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  nom: {
    type: String,
    required: [true, 'Le nom du site est requis'],
    trim: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Nouveau champ client vers le modèle Client
  clientRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  adresse: {
    rue: String,
    ville: String,
    codePostal: String,
    pays: {
      type: String,
      default: 'Tunisie'
    },
    adresseComplete: String
  },
  coordonnees: {
    latitude: Number,
    longitude: Number
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number]
  },
  superficie: {
    type: Number,
    min: 0
  },
  typeActivite: {
    type: String,
    trim: true
  },
  codeSecurite: {
    type: String,
    required: true,
    unique: true
  },
  contact: {
    nom: String,
    telephone: String,
    email: String
  },
  documents: [{
    nom: String,
    type: {
      type: String,
      enum: ['plan', 'doe', 'schema_electrique', 'schema_principe', 'autre']
    },
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  images: [{
    url: String,
    description: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  photos: [{
    url: String,
    nom: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  notes: String
}, {
  timestamps: true
});

// Index
siteSchema.index({ 'coordonnees.latitude': 1, 'coordonnees.longitude': 1 });
siteSchema.index({ location: '2dsphere' });
siteSchema.index({ client: 1 });
siteSchema.index({ clientRef: 1 });

// Synchronisation automatique du tenantId
siteSchema.pre('save', async function(next) {
  if (!this.tenantId) {
    // Essayer de récupérer depuis le client
    if (this.clientRef) {
      const Client = require('./Client');
      const client = await Client.findById(this.clientRef);
      if (client) {
        this.tenantId = client.tenantId;
      }
    }
    // Sinon depuis l'ancien champ client (User)
    else if (this.client) {
      const User = require('./User');
      const user = await User.findById(this.client);
      if (user && user.tenantId) {
        this.tenantId = user.tenantId;
      }
    }
  }
  next();
});

// Méthode pour mettre à jour les coordonnées
siteSchema.methods.updateCoordinates = async function() {
  if (this.coordonnees && this.coordonnees.latitude && this.coordonnees.longitude) {
    this.location = {
      type: 'Point',
      coordinates: [this.coordonnees.longitude, this.coordonnees.latitude]
    };
    await this.save();
  }
};

module.exports = mongoose.model('Site', siteSchema);
