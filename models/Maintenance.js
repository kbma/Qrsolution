const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
  equipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipment',
    required: true
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
  // Type de maintenance
  type: {
    type: String,
    enum: ['preventive', 'corrective', 'inspection', 'reparation'],
    required: true
  },
  // Fiche d'intervention
  statut: {
    type: String,
    enum: ['planifiee', 'en_cours', 'completee', 'annulee', 'reportee'],
    default: 'planifiee'
  },
  // Planification
  dateDebut: {
    type: Date,
    required: true
  },
  dateFin: Date,
  dateReelle: {
    debut: Date,
    fin: Date
  },
  // Affectation
  technicienAffecte: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  technicienExecutant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Détails d'intervention
  description: String,
  constatations: String,
  travailEffectue: String,
  
  // Pièces changées
  piecesChangees: [{
    designation: String,
    reference: String,
    quantite: Number,
    prixUnitaire: Number,
    dateChangement: Date
  }],
  
  // Rapports
  raport: {
    type: String, // URL du rapport PDF
    generatedAt: Date
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
  
  // Observations
  observations: String,
  prochainMaintenance: Date,
  
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

// Index pour performance
maintenanceSchema.index({ equipment: 1, statut: 1 });
maintenanceSchema.index({ site: 1, dateDebut: 1 });
maintenanceSchema.index({ technicienAffecte: 1, statut: 1 });

module.exports = mongoose.model('Maintenance', maintenanceSchema);
