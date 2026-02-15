const Building = require('../models/Building');
const Site = require('../models/Site');
const crypto = require('crypto');

// ===== CRUD BÂTIMENTS =====

/**
 * GET - Récupérer les bâtiments d'un site
 */
exports.getBuildingsBySite = async (req, res) => {
  try {
    const { siteId } = req.params;

    // Vérifier que le site existe
    const site = await Site.findById(siteId);
    if (!site) {
      return res.status(404).json({ success: false, message: 'Site non trouvé' });
    }

    // Vérifier les permissions (multi-tenant)
    if (req.user.role !== 'superadmin') {
      // Vérifier via tenantId
      if (req.tenantId && site.tenantId !== req.tenantId) {
        return res.status(403).json({ success: false, message: 'Non autorisé à accéder aux bâtiments de ce site' });
      }
    }

    const buildings = await Building.find({ site: siteId })
      .populate('site', 'nom')
      .populate('createdBy', 'nom email')
      .populate('updatedBy', 'nom email')
      .sort({ nom: 1 });

    res.json({
      success: true,
      count: buildings.length,
      data: buildings
    });
  } catch (error) {
    console.error('Erreur getBuildingsBySite:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Récupérer un bâtiment spécifique
 */
exports.getBuildingById = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id)
      .populate('site', 'nom')
      .populate('createdBy', 'nom email')
      .populate('updatedBy', 'nom email')
      .populate('documents.uploadedBy', 'nom email')
      .populate('images.uploadedBy', 'nom email');

    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }

    res.json({ success: true, data: building });
  } catch (error) {
    console.error('Erreur getBuildingById:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Créer un bâtiment
 */
exports.createBuilding = async (req, res) => {
  try {
    const { nom, site, type, numberOfFloors, superficie, description } = req.body;

    // Validation
    if (!nom || !site) {
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    }

    // Vérifier le site existe
    const siteExists = await Site.findById(site);
    if (!siteExists) {
      return res.status(404).json({ success: false, message: 'Site non trouvé' });
    }

    // Vérifier les permissions (multi-tenant)
    if (req.user.role !== 'superadmin' && req.tenantId && siteExists.tenantId !== req.tenantId) {
      return res.status(403).json({ success: false, message: 'Non autorisé à créer un bâtiment sur ce site' });
    }

    const building = new Building({
      nom,
      site,
      tenantId: req.tenantId || siteExists.tenantId,
      clientRef: req.user.client,
      type: type || 'autre',
      nombreEtages: numberOfFloors || 1,
      superficie: superficie || 0,
      description,
      createdBy: req.user._id
    });

    await building.save();

    const populated = await Building.findById(building._id)
      .populate('site', 'nom')
      .populate('createdBy', 'nom email');

    res.status(201).json({
      success: true,
      message: 'Bâtiment créé avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur createBuilding:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT - Modifier un bâtiment
 */
exports.updateBuilding = async (req, res) => {
  try {
    const { nom, type, numberOfFloors, superficie, description } = req.body;

    let building = await Building.findById(req.params.id);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }

    // Mise à jour
    if (nom) building.nom = nom;
    if (type) building.type = type;
    if (numberOfFloors) building.numberOfFloors = numberOfFloors;
    if (superficie) building.superficie = superficie;
    if (description) building.description = description;

    building.updatedBy = req.user._id;
    building.updatedAt = new Date();

    await building.save();

    const populated = await building.populate('site', 'nom');

    res.json({
      success: true,
      message: 'Bâtiment modifié avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur updateBuilding:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE - Supprimer un bâtiment
 */
exports.deleteBuilding = async (req, res) => {
  try {
    const building = await Building.findByIdAndDelete(req.params.id);

    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }

    res.json({ success: true, message: 'Bâtiment supprimé avec succès' });
  } catch (error) {
    console.error('Erreur deleteBuilding:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== SÉCURITÉ =====

/**
 * POST - Générer un code de sécurité avec validation périodique
 */
exports.generateSecurityCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { jours = 30 } = req.body; // Période de validation en jours (par défaut 30)

    const building = await Building.findById(id);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }

    // Générer un code unique
    let code;
    let isUnique = false;
    while (!isUnique) {
      code = crypto.randomBytes(6).toString('hex').toUpperCase();
      const existing = await Building.findOne({ 'codesSecurite.code': code });
      if (!existing) isUnique = true;
    }

    const dateDebut = new Date();
    const dateFin = new Date();
    dateFin.setDate(dateFin.getDate() + jours);

    const newCode = {
      code,
      dateCreation: dateDebut,
      dateValiditeDebut: dateDebut,
      dateValiditeFin: dateFin,
      nombreUtilisations: 0,
      estActif: true,
      creePar: req.user._id
    };

    if (!building.codesSecurite) {
      building.codesSecurite = [];
    }
    building.codesSecurite.push(newCode);
    building.updatedBy = req.user._id;
    await building.save();

    const populated = await Building.findById(building._id)
      .populate('site', 'nom')
      .populate('codesSecurite.creePar', 'nom email');

    res.status(201).json({
      success: true,
      message: 'Code de sécurité généré avec succès',
      data: {
        buildingId: building._id,
        code: newCode,
        building: populated
      }
    });
  } catch (error) {
    console.error('Erreur generateSecurityCode:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Récupérer les codes de sécurité d'un bâtiment
 */
exports.getSecurityCodes = async (req, res) => {
  try {
    const { id } = req.params;

    const building = await Building.findById(id)
      .select('codesSecurite')
      .populate('codesSecurite.creePar', 'nom email');

    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }

    res.json({
      success: true,
      data: building.codesSecurite || []
    });
  } catch (error) {
    console.error('Erreur getSecurityCodes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT - Incrémenter le compteur d'utilisation d'un code de sécurité
 */
exports.incrementSecurityCodeUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const { code } = req.body;

    const building = await Building.findById(id);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }

    const secCode = building.codesSecurite.find(c => c.code === code);
    if (!secCode) {
      return res.status(404).json({ success: false, message: 'Code non trouvé' });
    }

    // Vérifier la validité
    const maintenant = new Date();
    if (secCode.dateValiditeFin < maintenant) {
      return res.status(400).json({ success: false, message: 'Code expiré' });
    }

    if (!secCode.estActif) {
      return res.status(400).json({ success: false, message: 'Code inactif' });
    }

    secCode.nombreUtilisations += 1;
    await building.save();

    res.json({
      success: true,
      message: 'Utilisation enregistrée',
      data: secCode
    });
  } catch (error) {
    console.error('Erreur incrementSecurityCodeUsage:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE - Désactiver un code de sécurité
 */
exports.deactivateSecurityCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { code } = req.body;

    const building = await Building.findById(id);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }

    const secCode = building.codesSecurite.find(c => c.code === code);
    if (!secCode) {
      return res.status(404).json({ success: false, message: 'Code non trouvé' });
    }

    secCode.estActif = false;
    await building.save();

    res.json({
      success: true,
      message: 'Code désactivé avec succès'
    });
  } catch (error) {
    console.error('Erreur deactivateSecurityCode:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== GESTION RESPONSABLES DE BÂTIMENT =====

/**
 * POST - Ajouter un responsable au bâtiment
 */
exports.addResponsable = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const { nom, telephone, email, statut, photo, estPrioritaire } = req.body;
    
    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }
    
    // Si on ajoute un responsable prioritaire, retirer la priorité des autres
    if (estPrioritaire) {
      building.responsables.forEach(resp => {
        resp.estPrioritaire = false;
      });
    }
    
    // Ajouter le nouveau responsable
    building.responsables.push({
      nom,
      telephone,
      email,
      statut: statut || 'actif',
      photo,
      estPrioritaire: estPrioritaire || false,
      dateAjout: new Date()
    });
    
    await building.save();
    
    res.status(201).json({
      success: true,
      message: 'Responsable ajouté avec succès',
      data: building.responsables[building.responsables.length - 1]
    });
  } catch (error) {
    console.error('Erreur addResponsable:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Récupérer les responsables d'un bâtiment
 */
exports.getResponsables = async (req, res) => {
  try {
    const { buildingId } = req.params;
    
    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }
    
    res.json({
      success: true,
      count: building.responsables.length,
      data: building.responsables
    });
  } catch (error) {
    console.error('Erreur getResponsables:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT - Modifier un responsable
 */
exports.updateResponsable = async (req, res) => {
  try {
    const { buildingId, responsableId } = req.params;
    const { nom, telephone, email, statut, photo, estPrioritaire } = req.body;
    
    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }
    
    const responsable = building.responsables.id(responsableId);
    if (!responsable) {
      return res.status(404).json({ success: false, message: 'Responsable non trouvé' });
    }
    
    // Si on le rend prioritaire, retirer la priorité des autres
    if (estPrioritaire && !responsable.estPrioritaire) {
      building.responsables.forEach(resp => {
        resp.estPrioritaire = false;
      });
    }
    
    // Mettre à jour les champs
    if (nom) responsable.nom = nom;
    if (telephone) responsable.telephone = telephone;
    if (email) responsable.email = email;
    if (statut) responsable.statut = statut;
    if (photo) responsable.photo = photo;
    if (estPrioritaire !== undefined) responsable.estPrioritaire = estPrioritaire;
    
    await building.save();
    
    res.json({
      success: true,
      message: 'Responsable mis à jour',
      data: responsable
    });
  } catch (error) {
    console.error('Erreur updateResponsable:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE - Supprimer un responsable
 */
exports.deleteResponsable = async (req, res) => {
  try {
    const { buildingId, responsableId } = req.params;
    
    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Bâtiment non trouvé' });
    }
    
    building.responsables.id(responsableId).deleteOne();
    await building.save();
    
    res.json({
      success: true,
      message: 'Responsable supprimé'
    });
  } catch (error) {
    console.error('Erreur deleteResponsable:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = exports;
