const Equipment = require('../models/Equipment');
const Maintenance = require('../models/Maintenance');
const Intervention = require('../models/Intervention');
const QuoteRequest = require('../models/QuoteRequest');
const Site = require('../models/Site');
const User = require('../models/User');
const { createTenantQuery } = require('../middleware/tenantIsolation');

exports.getDashboardStats = async (req, res) => {
  try {
    // Le middleware `tenantIsolation` prépare le filtre de base.
    // `createTenantQuery` retourne { tenantId: '...' } pour un client, ou {} pour le superadmin.
    const tenantFilter = createTenantQuery(Equipment, req);

    // Filtre spécifique pour les interventions (mainteneur/technicien)
    let maintenanceFilter = { ...tenantFilter };
    if (['mainteneur', 'technicien'].includes(req.user.role)) {
      // Un mainteneur/technicien ne voit que les interventions qui lui sont assignées.
      // Correction: le champ est 'technicienAffecte' (basé sur maintenanceController.js)
      maintenanceFilter = { ...maintenanceFilter, technicienAffecte: req.user._id };
    }

    const [
      equipmentStats,
      countSites,
      maintenanceStats,
      interventionStats,
      quoteStats,
      userStats,
      activiteRecenteMaint,
      activiteRecenteInterv,
      recentEquipment
    ] = await Promise.all([
      // Équipements par statut
      Equipment.aggregate([
        { $match: tenantFilter },
        { $group: { _id: '$statut', count: { $sum: 1 } } }
      ]),
      // Sites total
      Site.countDocuments(tenantFilter),
      // Maintenances par statut
      Maintenance.aggregate([
        { $match: maintenanceFilter },
        { $group: { _id: '$statut', count: { $sum: 1 } } }
      ]),
      // Interventions par statut
      Intervention.aggregate([
        { $match: maintenanceFilter },
        { $group: { _id: '$statut', count: { $sum: 1 } } }
      ]),
      // Devis par statut
      QuoteRequest.aggregate([
        { $match: tenantFilter },
        { $group: { _id: '$statut', count: { $sum: 1 } } }
      ]),
      // Utilisateurs par rôle (pour superadmin/admin)
      User.aggregate([
        { $match: tenantFilter },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      // 5 dernières interventions
      Maintenance.find(maintenanceFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('equipment', 'nom')
        .populate('site', 'nom'),
      // 5 dernières interventions (Intervention model)
      Intervention.find(maintenanceFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('equipment', 'nom')
        .populate('site', 'nom'),
      // 5 derniers équipements ajoutés
      Equipment.find(tenantFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('site', 'nom')
    ]);

    // Helper pour transformer l'array d'aggrégation en objet { statut: count }
    const mapStats = (arr) => arr.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});

    const equipMap = mapStats(equipmentStats);
    const maintMap = mapStats(maintenanceStats);
    const intervMap = mapStats(interventionStats);
    const quoteMap = mapStats(quoteStats);
    const userMap = mapStats(userStats);

    // Fusionner les stats Maintenance et Intervention
    const combinedMaintMap = { ...maintMap };
    Object.keys(intervMap).forEach(key => {
      combinedMaintMap[key] = (combinedMaintMap[key] || 0) + intervMap[key];
    });

    const activiteRecente = [...activiteRecenteMaint, ...activiteRecenteInterv]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    res.status(200).json({
      success: true,
      data: {
        equipements: {
          total: Object.values(equipMap).reduce((a, b) => a + b, 0),
          byStatut: equipMap,
          alertes: (equipMap.en_panne || 0) + (equipMap.hors_service || 0)
        },
        sites: {
          total: countSites
        },
        interventions: {
          total: Object.values(combinedMaintMap).reduce((a, b) => a + b, 0),
          byStatut: combinedMaintMap,
          planifiee: combinedMaintMap.planifiee || 0,
          en_cours: combinedMaintMap.en_cours || 0,
          completee: (combinedMaintMap.completee || 0) + (combinedMaintMap.terminee || 0),
          annulee: combinedMaintMap.annulee || 0
        },
        devis: {
          total: Object.values(quoteMap).reduce((a, b) => a + b, 0),
          byStatut: quoteMap,
          envoyee: quoteMap.envoyee || 0
        },
        utilisateurs: {
          total: Object.values(userMap).reduce((a, b) => a + b, 0),
          byRole: userMap
        },
        activiteRecente,
        recentEquipment
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques du tableau de bord:', error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};