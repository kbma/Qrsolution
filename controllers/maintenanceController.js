const Maintenance = require('../models/Maintenance');
const Equipment = require('../models/Equipment');
const Site = require('../models/Site');
const Building = require('../models/Building');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

// ===== CRUD MAINTENANCE =====

/**
 * GET - Récupérer toutes les maintenances avec filtres
 */
exports.getAllMaintenance = async (req, res) => {
  try {
    const { site, building, equipment, statut, type, technitech } = req.query;
    let query = {};

    // Filtres
    if (site) query.site = site;
    if (building) query.building = building;
    if (equipment) query.equipment = equipment;
    if (statut) query.statut = statut;
    if (type) query.type = type;
    if (technitech) query.technicienAffecte = technitech;

    const maintenance = await Maintenance.find(query)
      .populate('equipment', 'nom type')
      .populate('site', 'nom')
      .populate('building', 'nom')
      .populate('technicienAffecte', 'nom email telephone')
      .populate('technicienExecutant', 'nom email')
      .populate('createdBy', 'nom email')
      .sort({ dateDebut: -1 });

    res.json({
      success: true,
      count: maintenance.length,
      data: maintenance
    });
  } catch (error) {
    console.error('Erreur getAllMaintenance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Récupérer une maintenance spécifique
 */
exports.getMaintenanceById = async (req, res) => {
  try {
    const maintenance = await Maintenance.findById(req.params.id)
      .populate('equipment', 'nom type marque modele')
      .populate('site', 'nom')
      .populate('building', 'nom')
      .populate('technicienAffecte', 'nom email telephone')
      .populate('technicienExecutant', 'nom email')
      .populate('createdBy', 'nom email')
      .populate('documents.uploadedBy', 'nom email');

    if (!maintenance) {
      return res.status(404).json({ success: false, message: 'Intervention non trouvée' });
    }

    res.json({ success: true, data: maintenance });
  } catch (error) {
    console.error('Erreur getMaintenanceById:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Créer une intervention de maintenance
 */
exports.createMaintenance = async (req, res) => {
  try {
    const { equipment, site, building, type, dateDebut, dateFin, description } = req.body;

    // Validation
    if (!equipment || !site || !type || !dateDebut) {
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    }

    // Vérifier l'équipement existe
    const equipExists = await Equipment.findById(equipment);
    if (!equipExists) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    const maintenance = new Maintenance({
      equipment,
      site,
      building: building || null,
      type,
      dateDebut,
      dateFin: dateFin || null,
      description,
      statut: 'planifiee',
      createdBy: req.user._id
    });

    await maintenance.save();

    const populated = await maintenance
      .populate('equipment', 'nom type')
      .populate('site', 'nom')
      .populate('building', 'nom');

    res.status(201).json({
      success: true,
      message: 'Intervention créée avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur createMaintenance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT - Modifier une intervention
 */
exports.updateMaintenance = async (req, res) => {
  try {
    const { type, dateDebut, dateFin, description } = req.body;

    let maintenance = await Maintenance.findById(req.params.id);
    if (!maintenance) {
      return res.status(404).json({ success: false, message: 'Intervention non trouvée' });
    }

    // Mise à jour
    if (type) maintenance.type = type;
    if (dateDebut) maintenance.dateDebut = dateDebut;
    if (dateFin) maintenance.dateFin = dateFin;
    if (description) maintenance.description = description;

    maintenance.updatedBy = req.user._id;
    maintenance.updatedAt = new Date();

    await maintenance.save();

    const populated = await maintenance.populate('equipment', 'nom');

    res.json({
      success: true,
      message: 'Intervention modifiée avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur updateMaintenance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH - Changer le statut d'une intervention
 */
exports.updateMaintenanceStatus = async (req, res) => {
  try {
    const { statut } = req.body;
    const validStatuts = ['planifiee', 'en_cours', 'completee', 'annulee', 'reportee'];

    if (!statut || !validStatuts.includes(statut)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    const maintenance = await Maintenance.findById(req.params.id);
    if (!maintenance) {
      return res.status(404).json({ success: false, message: 'Intervention non trouvée' });
    }

    // Si passage en cours, enregistrer le technicien exécutant
    if (statut === 'en_cours' && !maintenance.technicienExecutant) {
      maintenance.technicienExecutant = req.user._id;
    }

    // Si passage en complétée, enregistrer la date réelle
    if (statut === 'completee') {
      maintenance.dateReelle = new Date();
    }

    maintenance.statut = statut;
    maintenance.updatedBy = req.user._id;
    maintenance.updatedAt = new Date();

    await maintenance.save();

    res.json({
      success: true,
      message: 'Statut modifié avec succès',
      data: maintenance
    });
  } catch (error) {
    console.error('Erreur updateMaintenanceStatus:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE - Supprimer une intervention
 */
exports.deleteMaintenance = async (req, res) => {
  try {
    const maintenance = await Maintenance.findByIdAndDelete(req.params.id);

    if (!maintenance) {
      return res.status(404).json({ success: false, message: 'Intervention non trouvée' });
    }

    // Supprimer les fichiers
    if (maintenance.documents.length > 0) {
      maintenance.documents.forEach(doc => {
        const filePath = path.join(__dirname, '../../', doc.path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }

    res.json({ success: true, message: 'Intervention supprimée avec succès' });
  } catch (error) {
    console.error('Erreur deleteMaintenance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== AFFECTATION TECHNICIENS =====

/**
 * PATCH - Affecter un technicien à une intervention
 */
exports.assignTechnician = async (req, res) => {
  try {
    const { technicienId } = req.body;

    const maintenance = await Maintenance.findById(req.params.id);
    if (!maintenance) {
      return res.status(404).json({ success: false, message: 'Intervention non trouvée' });
    }

    // Vérifier que le technicien existe
    const technician = await User.findById(technicienId);
    if (!technician || technician.role !== 'technicien') {
      return res.status(404).json({ success: false, message: 'Technicien non trouvé' });
    }

    maintenance.technicienAffecte = technicienId;
    maintenance.updatedBy = req.user._id;
    maintenance.updatedAt = new Date();

    await maintenance.save();

    const populated = await maintenance.populate('technicienAffecte', 'nom email telephone');

    res.json({
      success: true,
      message: 'Technicien affecté avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur assignTechnician:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Récupérer les maintenances d'un technicien
 */
exports.getMaintenanceByTechnician = async (req, res) => {
  try {
    const { technicianId } = req.params;

    const maintenance = await Maintenance.find({ technicienAffecte: technicianId })
      .populate('equipment', 'nom type')
      .populate('site', 'nom')
      .populate('building', 'nom')
      .sort({ dateDebut: -1 });

    res.json({
      success: true,
      count: maintenance.length,
      data: maintenance
    });
  } catch (error) {
    console.error('Erreur getMaintenanceByTechnician:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== RAPPORT ET DOCUMENTS =====

/**
 * POST - Upload rapport de maintenance
 */
exports.uploadReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    const maintenance = await Maintenance.findById(req.params.id);
    if (!maintenance) {
      return res.status(404).json({ success: false, message: 'Intervention non trouvée' });
    }

    maintenance.rapport = {
      path: req.file.path.replace(/\\/g, '/'),
      filename: req.file.filename,
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    };

    await maintenance.save();

    res.json({
      success: true,
      message: 'Rapport uploadé avec succès',
      data: maintenance.rapport
    });
  } catch (error) {
    console.error('Erreur uploadReport:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Ajouter document
 */
exports.addDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    const maintenance = await Maintenance.findById(req.params.id);
    if (!maintenance) {
      return res.status(404).json({ success: false, message: 'Intervention non trouvée' });
    }

    maintenance.documents.push({
      nom: req.body.nom || req.file.originalname,
      path: req.file.path.replace(/\\/g, '/'),
      filename: req.file.filename,
      size: req.file.size,
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    });

    await maintenance.save();

    res.json({
      success: true,
      message: 'Document ajouté avec succès',
      data: maintenance.documents
    });
  } catch (error) {
    console.error('Erreur addDocument:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== PIÈCES CHANGÉES =====

/**
 * POST - Ajouter une pièce changée
 */
exports.addPart = async (req, res) => {
  try {
    const { nom, reference, quantite, prix, fournisseur } = req.body;

    const maintenance = await Maintenance.findById(req.params.id);
    if (!maintenance) {
      return res.status(404).json({ success: false, message: 'Intervention non trouvée' });
    }

    maintenance.piecesChangees.push({
      nom,
      reference: reference || '',
      quantite: quantite || 1,
      prix: prix || 0,
      fournisseur: fournisseur || '',
      dateRemplacement: new Date(),
      remplacePar: req.user._id
    });

    await maintenance.save();

    res.json({
      success: true,
      message: 'Pièce ajoutée avec succès',
      data: maintenance.piecesChangees
    });
  } catch (error) {
    console.error('Erreur addPart:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE - Supprimer une pièce
 */
exports.removePart = async (req, res) => {
  try {
    const maintenance = await Maintenance.findById(req.params.id);
    if (!maintenance) {
      return res.status(404).json({ success: false, message: 'Intervention non trouvée' });
    }

    const partIndex = maintenance.piecesChangees.findIndex(p => p._id.toString() === req.params.partId);
    if (partIndex === -1) {
      return res.status(404).json({ success: false, message: 'Pièce non trouvée' });
    }

    maintenance.piecesChangees.splice(partIndex, 1);
    await maintenance.save();

    res.json({
      success: true,
      message: 'Pièce supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur removePart:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== EXPORT ET STATISTIQUES =====

/**
 * GET - Export PDF d'une intervention
 */
exports.exportPDF = async (req, res) => {
  try {
    const maintenance = await Maintenance.findById(req.params.id)
      .populate('equipment', 'nom type marque modele')
      .populate('site', 'nom')
      .populate('building', 'nom')
      .populate('technicienAffecte', 'nom email')
      .populate('technicienExecutant', 'nom email');

    if (!maintenance) {
      return res.status(404).json({ success: false, message: 'Intervention non trouvée' });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="maintenance-${maintenance._id}.pdf"`);

    doc.pipe(res);

    // En-tête
    doc.fontSize(20).text('Rapport de Maintenance', { underline: true });
    doc.fontSize(12);

    // Infos intervention
    doc.text(`Type: ${maintenance.type}`);
    doc.text(`Statut: ${maintenance.statut}`);
    doc.text(`Équipement: ${maintenance.equipment?.nom}`);
    doc.text(`Site: ${maintenance.site?.nom}`);
    doc.text(`Bâtiment: ${maintenance.building?.nom || 'N/A'}`);
    doc.text(`Date début: ${new Date(maintenance.dateDebut).toLocaleDateString('fr-FR')}`);
    if (maintenance.dateFin) {
      doc.text(`Date fin prévue: ${new Date(maintenance.dateFin).toLocaleDateString('fr-FR')}`);
    }

    if (maintenance.technicienAffecte) {
      doc.text(`Technicien affecté: ${maintenance.technicienAffecte.nom}`);
    }

    // Pièces changées
    if (maintenance.piecesChangees.length > 0) {
      doc.moveDown().fontSize(14).text('Pièces changées', { underline: true });
      doc.fontSize(12);
      maintenance.piecesChangees.forEach(piece => {
        doc.text(`- ${piece.nom} (Qty: ${piece.quantite})`);
      });
    }

    doc.end();
  } catch (error) {
    console.error('Erreur exportPDF:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Statistiques de maintenance
 */
exports.getMaintenanceStats = async (req, res) => {
  try {
    const total = await Maintenance.countDocuments();
    const byStatut = await Maintenance.aggregate([
      { $group: { _id: '$statut', count: { $sum: 1 } } }
    ]);
    const byType = await Maintenance.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        total,
        byStatut,
        byType
      }
    });
  } catch (error) {
    console.error('Erreur getMaintenanceStats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = exports;
