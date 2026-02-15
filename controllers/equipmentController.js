const Equipment = require('../models/Equipment');
const Quote = require('../models/Quote');
const Site = require('../models/Site');
const Building = require('../models/Building');
const fs = require('fs');
const path = require('path');
const { generateEquipmentQR } = require('../utils/qrcode');

// ===== CRUD ÉQUIPEMENTS =====

/**
 * GET - Récupérer tous les équipements avec filtres et pagination
 */
exports.getEquipment = async (req, res) => {
  try {
    const { site, building, type, statut, etat, search, page = 1, limit = 10 } = req.query;
    let query = {};

    // Filtres
    if (site) query.site = site;
    if (building) query.building = building;
    if (type) query.type = type;
    if (statut) query.statut = statut;
    if (etat) query.etat = etat;
    if (search) {
      query.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { marque: { $regex: search, $options: 'i' } },
        { modele: { $regex: search, $options: 'i' } }
      ];
    }

    // Filtrer par tenantId (multi-tenant)
    // Les non-superadmins voient soit leurs propres données,
    // soit les équipements liés à des sites auxquels ils ont un accès général (siteAccess sans viaQuote),
    // soit uniquement des équipements explicitement autorisés via un devis accepté (viaQuote).
    if (req.user.role !== 'superadmin') {
      const siteAccess = req.user.siteAccess || [];
      const generalSiteIds = siteAccess.filter(a => !a.viaQuote).map(a => a.site).filter(Boolean);
      const viaQuoteIds = siteAccess.filter(a => a.viaQuote).map(a => a.viaQuote).filter(Boolean);

      // Récupérer les devis liés aux viaQuote et acceptés pour cet utilisateur
      let allowedEquipmentIds = [];
      if (viaQuoteIds.length > 0) {
        const acceptedQuotes = await Quote.find({
          _id: { $in: viaQuoteIds },
          statut: 'accepte'
        }).lean();
        // Garder uniquement les devis où l'utilisateur est destinataire et la réponse est acceptée
        acceptedQuotes.forEach(q => {
          const hasAcceptedResponse = (q.responses || []).some(r => r.destinataire && r.destinataire.toString() === req.user._id.toString() && r.statut === 'accepte');
          if (hasAcceptedResponse && q.equipment) {
            allowedEquipmentIds.push(q.equipment.toString());
          }
        });
      }

      // Construire condition: tenant OR generalSite OR specific equipment
      const conditions = [ { tenantId: req.user.tenantId } ];
      if (generalSiteIds.length > 0) conditions.push({ site: { $in: generalSiteIds } });
      if (allowedEquipmentIds.length > 0) conditions.push({ _id: { $in: allowedEquipmentIds } });

      const tenantOrSiteOrEquip = { $or: conditions };

      if (Object.keys(query).length > 0) {
        query = { $and: [ query, tenantOrSiteOrEquip ] };
      } else {
        query = tenantOrSiteOrEquip;
      }
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = limit === 'all' ? 0 : Math.max(1, parseInt(limit));
    const skip = limitNum > 0 ? (pageNum - 1) * limitNum : 0;

    // Requête
    let equipQuery = Equipment.find(query)
      .populate('site', 'nom')
      .populate('building', 'nom')
      .sort({ createdAt: -1 });

    // Compter total
    const total = await Equipment.countDocuments(query);

    // Appliquer pagination
    if (limitNum > 0) {
      equipQuery = equipQuery.skip(skip).limit(limitNum);
    }

    const equipment = await equipQuery;

    res.json({
      success: true,
      count: equipment.length,
      total: total,
      page: limitNum > 0 ? pageNum : 1,
      pages: limitNum > 0 ? Math.ceil(total / limitNum) : 1,
      limit: limitNum,
      data: equipment
    });
  } catch (error) {
    console.error('Erreur getEquipment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Récupérer un équipement spécifique
 */
exports.getEquipmentById = async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id)
      .populate('site', 'nom')
      .populate('building', 'nom')
      .populate('createdBy', 'nom email')
      .populate('updatedBy', 'nom email')
      .populate('documents.uploadedBy', 'nom email')
      .populate('images.uploadedBy', 'nom email');

    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    // Vérifier l'accès de l'utilisateur à cet équipement :
    // - Superadmin : ok
    // - Même tenant : ok
    // - Sinon : vérifier siteAccess. Autorisé si :
    //    * une entrée siteAccess sans viaQuote pour ce site (accès général), ou
    //    * une entrée siteAccess avec viaQuote correspondant à un devis accepté pour cet équipement et pour cet utilisateur.
    if (req.user.role !== 'superadmin') {
      if (equipment.tenantId && equipment.tenantId === req.user.tenantId) {
        // ok
      } else {
        const siteId = equipment.site ? (equipment.site._id || equipment.site).toString() : null;
        const siteAccess = (req.user.siteAccess || []).find(a => a.site && a.site.toString() === siteId);
        let allowed = false;
        if (siteAccess) {
          if (!siteAccess.viaQuote) {
            allowed = true;
          } else {
            // Vérifier le devis référencé
            try {
              const quote = await Quote.findById(siteAccess.viaQuote).lean();
              if (quote && quote.statut === 'accepte' && quote.equipment && quote.equipment.toString() === equipment._id.toString()) {
                // vérifier que la réponse acceptée appartient à cet utilisateur
                const hasAcceptedResponse = (quote.responses || []).some(r => r.destinataire && r.destinataire.toString() === req.user._id.toString() && r.statut === 'accepte');
                if (hasAcceptedResponse) allowed = true;
              }
            } catch (e) {
              // ignore
            }
          }
        }

        if (!allowed) {
          return res.status(403).json({ success: false, message: 'Accès refusé à cet équipement' });
        }
      }
    }

    res.json({ success: true, data: equipment });
  } catch (error) {
    console.error('Erreur getEquipmentById:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Récupérer équipement par code QR
 */
exports.getEquipmentByQR = async (req, res) => {
  try {
    const equipment = await Equipment.findOne({ 'qrCode.code': req.params.code })
      .populate('site', 'nom')
      .populate('building', 'nom')
      .populate('maintenance.mainteneurResponsable', 'prenom nom email')
      .populate('documents.uploadedBy', 'prenom nom')
      .populate('images.uploadedBy', 'prenom nom');

    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    // Vérifier l'accès de l'utilisateur : même logique que pour getEquipmentById
    if (req.user.role !== 'superadmin') {
      if (equipment.tenantId && equipment.tenantId === req.user.tenantId) {
        // ok
      } else {
        const siteId = equipment.site ? (equipment.site._id || equipment.site).toString() : null;
        const siteAccess = (req.user.siteAccess || []).find(a => a.site && a.site.toString() === siteId);
        let allowed = false;
        if (siteAccess) {
          if (!siteAccess.viaQuote) {
            allowed = true;
          } else {
            try {
              const quote = await Quote.findById(siteAccess.viaQuote).lean();
              if (quote && quote.statut === 'accepte' && quote.equipment && quote.equipment.toString() === equipment._id.toString()) {
                const hasAcceptedResponse = (quote.responses || []).some(r => r.destinataire && r.destinataire.toString() === req.user._id.toString() && r.statut === 'accepte');
                if (hasAcceptedResponse) allowed = true;
              }
            } catch (e) {
              // ignore
            }
          }
        }

        if (!allowed) {
          return res.status(403).json({ success: false, message: 'Accès refusé à cet équipement' });
        }
      }
    }

    res.json({ success: true, data: equipment });
  } catch (error) {
    console.error('Erreur getEquipmentByQR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Créer un équipement
 */
exports.createEquipment = async (req, res) => {
  try {
    // req.body contient les champs texte (grâce à multer)
    let { 
      nom, type, marque, modele, site, building, 
      statut, etat, description, notes, installation,
      categorie, numeroSerie, dateMiseService, dateFinGarantie,
      localisation, caracteristiques, maintenance,
      codeEquipement, codeLocalisation
    } = req.body;

    // Validation
    if (!nom || !type || !site || !codeLocalisation) {
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    }

    // Génération automatique du code équipement si non fourni
    if (!codeEquipement) {
      // Compter les équipements existants avec ce pattern pour estimer le prochain numéro
      const count = await Equipment.countDocuments({ codeEquipement: /^EQP-\d+$/ });
      let nextNum = count + 1;
      codeEquipement = `EQP-${String(nextNum).padStart(3, '0')}`;
      
      // Vérifier l'unicité et incrémenter si nécessaire (boucle de sécurité)
      while (await Equipment.findOne({ codeEquipement })) {
        nextNum++;
        codeEquipement = `EQP-${String(nextNum).padStart(3, '0')}`;
      }
    }

    // Vérifier unicité codeEquipement
    const existingCode = await Equipment.findOne({ codeEquipement });
    if (existingCode) {
      return res.status(400).json({ success: false, message: 'Ce code équipement est déjà utilisé.' });
    }

    // Vérifier le site existe
    const siteExists = await Site.findById(site);
    if (!siteExists) {
      return res.status(404).json({ success: false, message: 'Site non trouvé' });
    }

    // Parser les objets JSON s'ils sont des strings
    let parsedLocalisation = {};
    let parsedCaracteristiques = {};
    let parsedMaintenance = {};
    
    try {
      if (typeof localisation === 'string') {
        parsedLocalisation = JSON.parse(localisation);
      } else {
        parsedLocalisation = localisation || {};
      }
      
      if (typeof caracteristiques === 'string') {
        parsedCaracteristiques = JSON.parse(caracteristiques);
      } else {
        parsedCaracteristiques = caracteristiques || {};
      }
      
      if (typeof maintenance === 'string') {
        parsedMaintenance = JSON.parse(maintenance);
      } else {
        parsedMaintenance = maintenance || {};
      }
    } catch (parseError) {
      console.error('Erreur parsing JSON:', parseError);
    }

    // Traiter les images uploadées AVANT création de l'équipement
    let images = [];
    if (req.files && req.files.images && req.files.images.length > 0) {
      images = req.files.images.map((file, index) => {
        console.log(`✅ Image uploadée: ${file.filename} -> /uploads/images/${file.filename}`);
        return {
          url: `/uploads/images/${file.filename}`,
          description: `Image ${index + 1}`,
          uploadedAt: new Date(),
          uploadedBy: req.user._id
        };
      });
      console.log(`📸 ${req.files.images.length} image(s) ajoutée(s)`);
    }

    // Traiter les documents uploadés AVANT création de l'équipement
    let documents = [];
    if (req.files && req.files.documents && req.files.documents.length > 0) {
      documents = req.files.documents.map((file, index) => {
        console.log(`✅ Document uploadé: ${file.filename} -> /uploads/equipment-docs/${file.filename}`);
        return {
          url: `/uploads/equipment-docs/${file.filename}`,
          nom: file.originalname,
          type: file.mimetype,
          uploadedAt: new Date(),
          uploadedBy: req.user._id
        };
      });
      console.log(`📄 ${req.files.documents.length} document(s) ajouté(s)`);
    }

    // Créer l'équipement avec les images et documents
    const equipment = new Equipment({
      nom,
      type,
      codeEquipement,
      codeLocalisation,
      marque,
      modele,
      site,
      building: building || null,
      statut: statut || 'operationnel',
      etat: etat || 'bon',
      description,
      notes,
      installation,
      categorie,
      numeroSerie,
      dateMiseService: dateMiseService || null,
      dateFinGarantie: dateFinGarantie || null,
      localisation: parsedLocalisation,
      caracteristiques: parsedCaracteristiques,
      maintenance: parsedMaintenance,
      images,
      documents,
      createdBy: req.user._id,
      // Multi-tenant
      tenantId: req.user.tenantId
    });

    await equipment.save();

    // Générer le QR code
    const qrCodeData = await generateEquipmentQR(equipment);
    equipment.qrCode = qrCodeData;
    await equipment.save();

    // Refetch l'équipement pour s'assurer d'avoir un document valide
    const populated = await Equipment.findById(equipment._id)
      .populate('site', 'nom')
      .populate('building', 'nom')
      .populate('createdBy', 'nom email')
      .populate('documents.uploadedBy', 'nom email')
      .populate('images.uploadedBy', 'nom email');

    res.status(201).json({
      success: true,
      message: 'Équipement créé avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur createEquipment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT - Modifier un équipement
 */
exports.updateEquipment = async (req, res) => {
  try {
    const { 
      nom, type, marque, modele, site, building, 
      statut, etat, description, codeEquipement, codeLocalisation, localisation 
    } = req.body;

    let equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    // Mise à jour
    if (nom) equipment.nom = nom;
    if (type) equipment.type = type;
    if (marque) equipment.marque = marque;
    if (modele) equipment.modele = modele;
    if (site) equipment.site = site;
    if (building) equipment.building = building;
    if (statut) equipment.statut = statut;
    if (etat) equipment.etat = etat;
    if (description) equipment.description = description;
    
    if (codeEquipement && codeEquipement !== equipment.codeEquipement) {
      const existing = await Equipment.findOne({ codeEquipement });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Ce code équipement est déjà utilisé.' });
      }
      equipment.codeEquipement = codeEquipement;
    }
    
    if (codeLocalisation) equipment.codeLocalisation = codeLocalisation;

    // Mise à jour de la localisation (incluant GPS OpenStreetMap)
    if (localisation) {
      try {
        const parsedLocalisation = typeof localisation === 'string' 
          ? JSON.parse(localisation) 
          : localisation;
        
        // Fusionner avec l'existant ou remplacer selon le besoin
        const currentLoc = equipment.localisation && typeof equipment.localisation.toObject === 'function'
          ? equipment.localisation.toObject()
          : (equipment.localisation || {});

        equipment.localisation = { ...currentLoc, ...parsedLocalisation };
      } catch (e) {
        console.error('Erreur parsing localisation update:', e);
      }
    }

    equipment.updatedBy = req.user._id;
    equipment.updatedAt = new Date();

    await equipment.save();

    const populated = await Equipment.findById(equipment._id)
      .populate('site', 'nom')
      .populate('building', 'nom');

    res.json({
      success: true,
      message: 'Équipement modifié avec succès',
      data: populated
    });
  } catch (error) {
    console.error('Erreur updateEquipment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE - Supprimer un équipement
 */
exports.deleteEquipment = async (req, res) => {
  try {
    const equipment = await Equipment.findByIdAndDelete(req.params.id);

    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    // Supprimer fichiers
    if (equipment.documents.length > 0) {
      equipment.documents.forEach(doc => {
        const filePath = path.join(__dirname, '../../', doc.path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }

    if (equipment.images.length > 0) {
      equipment.images.forEach(img => {
        const filePath = path.join(__dirname, '../../', img.path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }

    res.json({ success: true, message: 'Équipement supprimé avec succès' });
  } catch (error) {
    console.error('Erreur deleteEquipment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== UPLOAD DOCUMENTS ET IMAGES =====

/**
 * POST - Upload documents (fiches techniques, plans, DOE, schémas, etc)
 */
exports.uploadDocuments = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    const document = {
      nom: req.body.documentNames || req.file.originalname,
      type: req.body.documentType || req.body.documentTypes?.[0] || 'autre',
      url: `/uploads/equipment-docs/${req.file.filename}`,
      mimeType: req.file.mimetype,
      taille: req.file.size,
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    };

    console.log(`📄 Document uploadé: ${req.file.filename} -> ${document.url}`);
    equipment.documents.push(document);
    await equipment.save();

    // Retourner l'équipement complet pour mise à jour du frontend
    const updatedEquipment = await Equipment.findById(equipment._id)
      .populate('site', 'nom')
      .populate('building', 'nom')
      .populate('createdBy', 'nom email')
      .populate('updatedBy', 'nom email')
      .populate('documents.uploadedBy', 'nom email')
      .populate('images.uploadedBy', 'nom email');

    res.json({
      success: true,
      message: 'Document uploadé avec succès',
      data: updatedEquipment
    });
  } catch (error) {
    console.error('Erreur uploadDocuments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Upload images
 */
exports.uploadImages = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune image uploadée' });
    }

    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    const image = {
      url: `/uploads/images/${req.file.filename}`,
      description: req.body.description || req.file.originalname,
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    };

    console.log(`📸 Image uploadée: ${req.file.filename} -> ${image.url}`);
    equipment.images.push(image);
    await equipment.save();

    // Retourner l'équipement complet pour mise à jour du frontend
    const updatedEquipment = await Equipment.findById(equipment._id)
      .populate('site', 'nom')
      .populate('building', 'nom')
      .populate('createdBy', 'nom email')
      .populate('updatedBy', 'nom email')
      .populate('documents.uploadedBy', 'nom email')
      .populate('images.uploadedBy', 'nom email');

    res.json({
      success: true,
      message: 'Image uploadée avec succès',
      data: updatedEquipment
    });
  } catch (error) {
    console.error('Erreur uploadImages:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Upload documents ET images (fichier mixte)
 */
exports.uploadMedia = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    const isImage = (mimetype) => mimetype.startsWith('image/');

    req.files.forEach(file => {
      const fileData = {
        nom: file.originalname,
        path: file.path.replace(/\\/g, '/'),
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
        uploadedBy: req.user._id,
        uploadedAt: new Date()
      };

      if (isImage(file.mimetype)) {
        equipment.images.push(fileData);
      } else {
        fileData.type = 'autre';
        equipment.documents.push(fileData);
      }
    });

    await equipment.save();

    // Retourner l'équipement complet pour mise à jour du frontend
    const updatedEquipment = await Equipment.findById(equipment._id)
      .populate('site', 'nom')
      .populate('building', 'nom')
      .populate('createdBy', 'nom email')
      .populate('updatedBy', 'nom email')
      .populate('documents.uploadedBy', 'nom email')
      .populate('images.uploadedBy', 'nom email');

    res.json({
      success: true,
      message: 'Fichiers uploadés',
      data: updatedEquipment
    });
  } catch (error) {
    console.error('Erreur uploadMedia:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== HISTORIQUE =====

/**
 * GET - Récupérer l'historique des modifications
 */
exports.getHistorique = async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id)
      .populate('historique.user', 'nom email');

    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    res.json({
      success: true,
      data: equipment.historique || []
    });
  } catch (error) {
    console.error('Erreur getHistorique:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Ajouter une entrée d'historique
 */
exports.addHistoriqueEntry = async (req, res) => {
  try {
    const { action, description } = req.body;

    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    equipment.historique.push({
      action: action || 'modification',
      description,
      user: req.user._id,
      date: new Date()
    });

    await equipment.save();

    const populated = await equipment.populate('historique.user', 'nom email');

    res.json({
      success: true,
      message: 'Entrée ajoutée à l\'historique',
      data: populated.historique
    });
  } catch (error) {
    console.error('Erreur addHistoriqueEntry:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Récupérer les fiches d'intervention liées
 */
exports.getFichesIntervention = async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    // Récupérer les documents de type "fiche_intervention"
    const fiches = equipment.documents.filter(d => d.type === 'fiche_intervention');

    res.json({
      success: true,
      count: fiches.length,
      data: fiches
    });
  } catch (error) {
    console.error('Erreur getFichesIntervention:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== EXPORT =====

/**
 * GET - Export PDF d'un équipement
 */
exports.exportPDF = async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id)
      .populate('site', 'nom')
      .populate('building', 'nom')
      .populate('createdBy', 'nom email');

    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    // Utiliser pdfkit pour créer le PDF
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="equipment-${equipment._id}.pdf"`);

    doc.pipe(res);

    // En-tête
    doc.fontSize(20).text('Fiche Équipement', { underline: true });
    doc.fontSize(12);

    // Informations principales
    doc.text(`Nom: ${equipment.nom}`);
    doc.text(`Type: ${equipment.type}`);
    doc.text(`Marque: ${equipment.marque || 'N/A'}`);
    doc.text(`Modèle: ${equipment.modele || 'N/A'}`);
    doc.text(`Statut: ${equipment.statut}`);
    doc.text(`État: ${equipment.etat}`);
    doc.text(`Site: ${equipment.site?.nom || 'N/A'}`);
    doc.text(`Bâtiment: ${equipment.building?.nom || 'N/A'}`);
    doc.text(`Créé le: ${new Date(equipment.createdAt).toLocaleDateString('fr-FR')}`);

    if (equipment.description) {
      doc.text(`\nDescription: ${equipment.description}`);
    }

    // Documents
    if (equipment.documents.length > 0) {
      doc.moveDown().fontSize(14).text('Documents', { underline: true });
      doc.fontSize(12);
      equipment.documents.forEach(document => {
        doc.text(`- ${document.nom} (${document.type})`);
      });
    }

    doc.end();
  } catch (error) {
    console.error('Erreur exportPDF:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET - Export Excel de plusieurs équipements
 */
exports.exportExcel = async (req, res) => {
  try {
    const { equipmentIds } = req.query;
    
    let query = {};
    if (equipmentIds) {
      query._id = { $in: equipmentIds.split(',') };
    }

    const equipment = await Equipment.find(query)
      .populate('site', 'nom')
      .populate('building', 'nom');

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Équipements');

    // En-têtes
    worksheet.columns = [
      { header: 'Nom', key: 'nom', width: 20 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Marque', key: 'marque', width: 15 },
      { header: 'Modèle', key: 'modele', width: 15 },
      { header: 'Statut', key: 'statut', width: 12 },
      { header: 'État', key: 'etat', width: 12 },
      { header: 'Site', key: 'site', width: 20 },
      { header: 'Bâtiment', key: 'building', width: 20 },
      { header: 'Créé le', key: 'createdAt', width: 15 }
    ];

    // Données
    equipment.forEach(equip => {
      worksheet.addRow({
        nom: equip.nom,
        type: equip.type,
        marque: equip.marque,
        modele: equip.modele,
        statut: equip.statut,
        etat: equip.etat,
        site: equip.site?.nom,
        building: equip.building?.nom,
        createdAt: new Date(equip.createdAt).toLocaleDateString('fr-FR')
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="equipments.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur exportExcel:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Uploader une image d'équipement
 */
exports.uploadImage = async (req, res) => {
  try {
    console.log('uploadImage - req.files:', req.files);
    console.log('uploadImage - req.file:', req.file);
    
    const { id } = req.params;
    const { description } = req.body;

    // req.file est fourni par upload.single()
    if (!req.file) {
      console.log('uploadImage - ERREUR: pas de fichier');
      return res.status(400).json({ success: false, message: 'Aucune image fournie' });
    }

    console.log('uploadImage - fichier trouvé:', req.file.filename);

    const equipment = await Equipment.findById(id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    const imageUrl = `/uploads/images/${req.file.filename}`;
    
    equipment.images.push({
      url: imageUrl,
      description: description || '',
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    });

    await equipment.save();

    const updated = await Equipment.findById(id).populate('images.uploadedBy', 'nom email');

    res.status(201).json({
      success: true,
      message: 'Image uploadée avec succès',
      data: updated
    });
  } catch (error) {
    console.error('Erreur uploadImage:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST - Uploader un document technique
 */
exports.uploadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType } = req.body;

    // req.file est fourni par upload.single()
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun document fourni' });
    }

    const equipment = await Equipment.findById(id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    const documentUrl = `/uploads/equipment-docs/${req.file.filename}`;
    
    equipment.documents.push({
      nom: req.file.originalname,
      type: documentType || 'autre',
      url: documentUrl,
      mimeType: req.file.mimetype,
      taille: req.file.size,
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    });

    await equipment.save();

    const updated = await Equipment.findById(id).populate('documents.uploadedBy', 'nom email');

    res.status(201).json({
      success: true,
      message: 'Document uploadé avec succès',
      data: updated
    });
  } catch (error) {
    console.error('Erreur uploadDocument:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE - Supprimer une image d'équipement
 */
exports.deleteImage = async (req, res) => {
  try {
    const { id, imageId } = req.params;

    const equipment = await Equipment.findById(id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    const imageIndex = equipment.images.findIndex(img => img._id.toString() === imageId);
    if (imageIndex === -1) {
      return res.status(404).json({ success: false, message: 'Image non trouvée' });
    }

    // Supprimer le fichier
    const imageUrl = equipment.images[imageIndex]?.url;
    if (imageUrl) {
      const imagePath = imageUrl.replace('/uploads/', 'backend/uploads/');
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    equipment.images.splice(imageIndex, 1);
    await equipment.save();

    res.json({
      success: true,
      message: 'Image supprimée avec succès',
      data: equipment
    });
  } catch (error) {
    console.error('Erreur deleteImage:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE - Supprimer un document d'équipement
 */
exports.deleteDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;

    const equipment = await Equipment.findById(id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    const docIndex = equipment.documents.findIndex(doc => doc._id.toString() === docId);
    if (docIndex === -1) {
      return res.status(404).json({ success: false, message: 'Document non trouvé' });
    }

    // Supprimer le fichier
    const docPath = equipment.documents[docIndex].url.replace('/uploads/', 'backend/uploads/');
    if (fs.existsSync(docPath)) {
      fs.unlinkSync(docPath);
    }

    equipment.documents.splice(docIndex, 1);
    await equipment.save();

    res.json({
      success: true,
      message: 'Document supprimé avec succès',
      data: equipment
    });
  } catch (error) {
    console.error('Erreur deleteDocument:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT - Définir image principale
 */
exports.setMainImage = async (req, res) => {
  try {
    const { id, imageId } = req.params;

    const equipment = await Equipment.findById(id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Équipement non trouvé' });
    }

    const imageIndex = equipment.images.findIndex(img => img._id.toString() === imageId);
    if (imageIndex === -1) {
      return res.status(404).json({ success: false, message: 'Image non trouvée' });
    }

    // Déplacer l'image au début du tableau
    const mainImage = equipment.images.splice(imageIndex, 1)[0];
    equipment.images.unshift(mainImage);

    await equipment.save();

    const updated = await Equipment.findById(id).populate('images.uploadedBy', 'nom email');

    res.json({
      success: true,
      message: 'Image principale définie avec succès',
      data: updated
    });
  } catch (error) {
    console.error('Erreur setMainImage:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== STATISTIQUES =====

/**
 * GET - Statistiques des équipements
 */
exports.getEquipmentStats = async (req, res) => {
  try {
    const total = await Equipment.countDocuments();
    const byStatut = await Equipment.aggregate([
      { $group: { _id: '$statut', count: { $sum: 1 } } }
    ]);
    const byType = await Equipment.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    const byEtat = await Equipment.aggregate([
      { $group: { _id: '$etat', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        total,
        byStatut,
        byType,
        byEtat
      }
    });
  } catch (error) {
    console.error('Erreur getEquipmentStats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = exports;
