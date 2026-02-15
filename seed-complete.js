const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Client = require('./models/Client');
const Site = require('./models/Site');
const Building = require('./models/Building');
const Equipment = require('./models/Equipment');
const Intervention = require('./models/Intervention');
const Quote = require('./models/Quote');
const QuoteRequest = require('./models/QuoteRequest');
require('dotenv').config();

// Données contexte France/Paris
const frenchFirstNames = ['Jean', 'Pierre', 'Marie', 'Sophie', 'Claude', 'Laurent', 'Martine', 'Philippe', 'Brigitte', 'Gérard', 'Monique', 'André', 'Valérie', 'François', 'Nicole'];
const frenchLastNames = ['Dupont', 'Martin', 'Bernard', 'Dubois', 'Laurent', 'Simon', 'Michel', 'Garcia', 'David', 'Petit', 'Durand', 'Lefevre', 'Moreau', 'Girard', 'Antoine'];
const parisArrondissements = ['1er', '2e', '3e', '4e', '5e', '6e', '7e', '8e', '9e', '10e', '11e', '12e', '13e', '14e', '15e', '16e', '17e', '18e', '19e', '20e'];
const siteNames = ['Siège Social Paris', 'Usine Île-de-France', 'Centre Logistique Trappes', 'Bureau Montparnasse', 'Entrepôt Saint-Denis'];
const buildingTypes = ['bureau', 'production', 'stockage', 'commercial', 'residentiel'];
const equipmentTypes = ['chauffage', 'climatisation', 'ventilation', 'pompe', 'chaudiere', 'cta', 'autre'];
const equipmentBrands = ['Daikin', 'Carrier', 'Trane', 'Mitsubishi', 'LG', 'Samsung', 'Airwell', 'Ciat'];
const interventionTypes = ['preventive', 'corrective', 'urgence', 'inspection'];
const interventionStatus = ['planifiee', 'en_cours', 'terminee', 'reportee', 'annulee'];

// Générer données aléatoires
function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomEmail() {
  return `user${Math.floor(Math.random() * 10000)}@example.fr`;
}

function getRandomPhone() {
  return `+33 ${Math.floor(Math.random() * 9) + 1} ${Math.floor(Math.random() * 100)} ${Math.floor(Math.random() * 100)} ${Math.floor(Math.random() * 100)}`;
}

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/qr-solution');
    console.log('🔌 MongoDB connecté');

    // Nettoyer les collections existantes
    await Promise.all([
      User.deleteMany({}),
      Client.deleteMany({}),
      Site.deleteMany({}),
      Building.deleteMany({}),
      Equipment.deleteMany({}),
      Intervention.deleteMany({}),
      Quote.deleteMany({}),
      QuoteRequest.deleteMany({})
    ]);
    console.log('🗑️ Collections nettoyées');

    // ===== CRÉER LE CLIENT =====
    const clientData = {
      identiteJuridique: {
        denomination: 'Climatisation France SARL',
        formeJuridique: 'SARL',
        siren: '123456789',
        siret: '12345678900012',
        numeroTVA: 'FR12345678901'
      },
      coordonnees: {
        adresse: {
          rue: '100 Avenue de Paris',
          ville: 'Paris',
          codePostal: '75001',
          pays: 'France'
        },
        telephone: '+33 1 23 45 67 89',
        email: 'contact@climatisation-france.fr',
        siteWeb: 'https://www.climatisation-france.fr'
      },
      subscription: {
        plan: 'PROFESSIONAL',
        statut: 'actif',
        dateDebut: new Date(),
        dateExpiration: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        limites: {
          utilisateurs: 20,
          sites: 50,
          equipements: 500,
          interventionsMois: 200
        }
      }
    };
    
    const createdClient = await Client.create(clientData);
    console.log('✅ Client créé:', createdClient.identiteJuridique.denomination);
    const clientTenantId = createdClient.tenantId;

    // ===== CRÉER LES UTILISATEURS =====
    const users = [];
    
    // Super Admin
    users.push({
      nom: 'Admin',
      prenom: 'Super',
      email: 'superadmin@qrsolution.com',
      password: await bcrypt.hash('admin123', 10),
      telephone: '+33 1 23 45 67 89',
      role: 'superadmin',
      tenantId: 'SUPERADMIN-TNT',
      entreprise: 'QR Solution',
      isActive: true,
      dateCreation: new Date('2024-01-01')
    });

    // Client
    users.push({
      nom: 'Dupont',
      prenom: 'Jean',
      email: 'client@test.com',
      password: await bcrypt.hash('client123', 10),
      telephone: '+33 1 34 56 78 90',
      role: 'client_admin',
      roleLegacy: 'client',
      client: createdClient._id,
      tenantId: clientTenantId,
      entreprise: 'Climatisation France SARL',
      isActive: true,
      dateCreation: new Date('2024-01-05')
    });

    // Mainteneur Interne
    users.push({
      nom: 'Martin',
      prenom: 'Paul',
      email: 'mainteneur@test.com',
      password: await bcrypt.hash('mainteneur123', 10),
      telephone: '+33 1 45 67 89 01',
      role: 'responsable_affaires',
      roleLegacy: 'mainteneur_interne',
      client: createdClient._id,
      tenantId: clientTenantId,
      entreprise: 'Service Maintenance Pro',
      isActive: true,
      dateCreation: new Date('2024-01-10')
    });

    // Mainteneur Externe
    users.push({
      nom: 'Bernard',
      prenom: 'Luc',
      email: 'externe@test.com',
      password: await bcrypt.hash('externe123', 10),
      telephone: '+33 1 56 78 90 12',
      role: 'mainteneur_externe',
      roleLegacy: 'mainteneur_externe',
      client: createdClient._id,
      tenantId: clientTenantId,
      entreprise: 'Prestataire Clim Externe',
      isActive: true,
      dateCreation: new Date('2024-01-12')
    });

    // Technicien
    users.push({
      nom: 'Petit',
      prenom: 'Alex',
      email: 'technicien@test.com',
      password: await bcrypt.hash('tech123', 10),
      telephone: '+33 1 67 89 01 23',
      role: 'technicien',
      roleLegacy: 'technicien',
      client: createdClient._id,
      tenantId: clientTenantId,
      isActive: true,
      dateCreation: new Date('2024-01-15')
    });

    // 15 utilisateurs supplémentaires (mainteneurs, techniciens)
    for (let i = 0; i < 15; i++) {
      const isMainteneur = i < 10;
      users.push({
        nom: getRandomItem(frenchLastNames),
        prenom: getRandomItem(frenchFirstNames),
        email: getRandomEmail(),
        password: await bcrypt.hash('password123', 10),
        telephone: getRandomPhone(),
        role: isMainteneur ? (i % 2 === 0 ? 'responsable_affaires' : 'mainteneur_externe') : 'technicien',
        roleLegacy: isMainteneur ? (i % 2 === 0 ? 'mainteneur_interne' : 'mainteneur_externe') : 'technicien',
        client: createdClient._id,
        tenantId: clientTenantId,
        entreprise: isMainteneur ? 'Service Maintenance Pro' : undefined,
        isActive: true,
        dateCreation: new Date(2024, Math.floor(Math.random() * 2), Math.floor(Math.random() * 28) + 1)
      });
    }

    const createdUsers = await User.insertMany(users);
    console.log(`✅ ${createdUsers.length} utilisateurs créés`);

    // Lier les mainteneurs/techniciens au client pour l'affichage côté client
    const clientUser = createdUsers.find(u => u.email === 'client@test.com');
    const linkedUserIds = createdUsers
      .filter(u => ['mainteneur_externe', 'technicien'].includes(u.role))
      .map(u => u._id);
    if (clientUser && linkedUserIds.length > 0) {
      await User.updateMany(
        { _id: { $in: linkedUserIds } },
        { $set: { client: clientUser._id, createdBy: clientUser._id } }
      );
    }

    // L'abonnement est déjà créé dans le Client
    console.log('✅ Abonnement (inclus dans le client)');

    // ===== CRÉER LES SITES =====
    const sites = [];
    const siteArray = ['Siège Social Paris 8ème', 'Usine Île-de-France', 'Centre Logistique Roissy', 'Bureau Montparnasse Paris 14ème', 'Entrepôt Saint-Denis'];
    
    for (let i = 0; i < 5; i++) {
      // Coordonnées GPS approximatives pour Paris et région IDF
      const coordonnees = [
        { lat: 48.8707, lng: 2.3068 },    // 8ème Paris
        { lat: 48.7500, lng: 2.4000 },    // Île-de-France
        { lat: 49.0050, lng: 2.5500 },    // Roissy
        { lat: 48.8326, lng: 2.3340 },    // 14ème Paris
        { lat: 48.9355, lng: 2.3568 }     // Saint-Denis
      ];
      const coord = coordonnees[i];
      
      sites.push({
        nom: siteArray[i],
        client: createdClient._id,
        clientRef: createdClient._id,
        tenantId: clientTenantId,
        codeSecurite: 'SEC-' + Math.random().toString(36).substring(2, 15).toUpperCase(),
        adresse: {
          rue: `${100 + i} Avenue de Paris`,
          ville: 'Paris',
          codePostal: '750' + (10 + i).toString().padStart(2, '0'),
          pays: 'France'
        },
        coordonnees: {
          latitude: coord.lat,
          longitude: coord.lng
        },
        location: {
          type: 'Point',
          coordinates: [coord.lng, coord.lat]
        },
        contact: {
          nom: `Responsable Site ${i + 1}`,
          telephone: getRandomPhone(),
          email: `site${i + 1}@example.fr`
        },
        typeActivite: 'HVAC - Climatisation',
        superficie: 1000 + Math.floor(Math.random() * 5000),
        isActive: true,
        notes: `Site de climatisation et maintenance - ${siteArray[i]}`
      });
    }

    const createdSites = await Site.insertMany(sites);
    console.log(`✅ ${createdSites.length} sites créés`);

    // ===== CRÉER LES BÂTIMENTS =====
    const buildings = [];
    for (let i = 0; i < 50; i++) {
      const site = createdSites[i % 5];
      buildings.push({
        nom: `Bâtiment ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`,
        type: getRandomItem(buildingTypes),
        site: site._id,
        clientRef: createdClient._id,
        tenantId: clientTenantId,
        nombreEtages: Math.floor(Math.random() * 10) + 1,
        superficie: 500 + Math.floor(Math.random() * 5000),
        anneeConstruction: 2000 + Math.floor(Math.random() * 24),
        isActive: true,
        createdBy: createdUsers[Math.floor(Math.random() * createdUsers.length)]._id,
        codesSecurite: [],
        images: [],
        documents: []
      });
    }

    const createdBuildings = await Building.insertMany(buildings);
    console.log(`✅ ${createdBuildings.length} bâtiments créés`);

    // ===== CRÉER LES ÉQUIPEMENTS =====
    const equipments = [];
    for (let i = 0; i < 100; i++) {
      const site = createdSites[i % 5];
      const building = createdBuildings[i % 50];
      equipments.push({
        nom: `${getRandomItem(equipmentTypes)} #${(i + 1).toString().padStart(3, '0')}`,
        site: site._id,
        clientRef: createdClient._id,
        tenantId: clientTenantId,
        building: building._id,
        type: getRandomItem(equipmentTypes),
        marque: getRandomItem(equipmentBrands),
        modele: `Model-${2020 + Math.floor(Math.random() * 4)}-${Math.floor(Math.random() * 1000)}`,
        numeroSerie: `SN${Math.random().toString(36).substr(2, 10).toUpperCase()}`,
        dateAcquisition: new Date(2018 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 12), 1),
        dateInstallation: new Date(2018 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 12), 1),
        garantieExpiration: new Date(2024 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 12), 1),
        qrCode: {
          code: `QR-${(i + 1).toString().padStart(4, '0')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          imageUrl: ''
        },
        localisation: {
          description: `${building.nom} - Étage ${Math.floor(Math.random() * building.nombreEtages) + 1}`,
          etage: `${Math.floor(Math.random() * building.nombreEtages) + 1}`,
          zone: `Zone ${String.fromCharCode(65 + (i % 5))}`,
          coordonnees: {
            x: Math.floor(Math.random() * 100),
            y: Math.floor(Math.random() * 100),
            z: Math.floor(Math.random() * 10)
          }
        },
        caracteristiques: {
          puissance: Math.floor(Math.random() * 100) + 5,
          capacite: Math.floor(Math.random() * 50) + 10,
          tension: '400V',
          poids: Math.floor(Math.random() * 200) + 50,
          dimensions: {
            longueur: Math.floor(Math.random() * 100) + 50,
            largeur: Math.floor(Math.random() * 100) + 50,
            hauteur: Math.floor(Math.random() * 100) + 50
          }
        },
        statut: getRandomItem(['operationnel', 'en_maintenance', 'en_panne', 'hors_service']),
        etat: getRandomItem(['excellent', 'bon', 'moyen', 'mauvais']),
        responsable: createdUsers[Math.floor(Math.random() * createdUsers.length)]._id,
        dateCreation: new Date(2024, 0, Math.floor(Math.random() * 28) + 1),
        images: [],
        documents: [],
        historique: []
      });
    }

    const createdEquipments = await Equipment.insertMany(equipments);
    console.log(`✅ ${createdEquipments.length} équipements créés`);

    // ===== CRÉER LES INTERVENTIONS =====
    const interventions = [];
    for (let i = 0; i < 150; i++) {
      const equipment = createdEquipments[i % 100];
      const technicien = createdUsers.filter(u => u.role === 'technicien')[i % 10];
      interventions.push({
        numero: `INT-2024-${(i + 1).toString().padStart(5, '0')}`,
        equipment: equipment._id,
        site: equipment.site,
        clientRef: createdClient._id,
        tenantId: clientTenantId,
        type: getRandomItem(interventionTypes),
        titre: `Intervention #${i + 1} - ${equipment.nom}`,
        description: `Intervention de maintenance - ${getRandomItem(['Remplacement filtre', 'Révision complète', 'Dépannage urgent', 'Nettoyage', 'Test de performance'])}`,
        priorite: getRandomItem(['basse', 'normale', 'haute', 'urgente']),
        statut: getRandomItem(interventionStatus),
        datePrevu: new Date(2024, Math.floor(Math.random() * 2), Math.floor(Math.random() * 28) + 1),
        dateDebut: new Date(2024, Math.floor(Math.random() * 2), Math.floor(Math.random() * 28) + 1),
        dateFin: new Date(2024, Math.floor(Math.random() * 2), Math.floor(Math.random() * 28) + 1),
        techniciens: technicien ? [{ technicien: technicien._id, role: 'responsable' }] : [],
        notes: `Intervention #${i + 1} - Observations techniques`
      });
    }

    const createdInterventions = await Intervention.insertMany(interventions);
    console.log(`✅ ${createdInterventions.length} interventions créées`);

    // ===== CRÉER LES DEMANDES DE DEVIS =====
    const quotes = [];
    for (let i = 0; i < 20; i++) {
      const site = createdSites[i % 5];
      const montantHT = Math.floor(Math.random() * 5000) + 1000;
      const TVA = 20;
      const montantTTC = Math.round(montantHT * (1 + TVA / 100));
      const destinataire = createdUsers.find(u => u.role === 'mainteneur_interne') || createdUsers.find(u => u.role === 'mainteneur_externe') || clientUser;

      quotes.push({
        numero: `DEV-2024-${(i + 1).toString().padStart(5, '0')}`,
        site: site._id,
        clientRef: createdClient._id,
        tenantId: clientTenantId,
        demandeur: clientUser._id,
        demandeurType: 'client',
        destinataire: destinataire._id,
        type: getRandomItem(['preventive', 'corrective', 'revision', 'installation', 'autre']),
        description: `Demande de devis - ${getRandomItem(['Maintenance équipement', 'Installation climatisation', 'Réparation urgente', 'Contrat annuel', 'Upgrade système'])}`,
        urgence: getRandomItem(['basse', 'normale', 'haute', 'critique']),
        statut: getRandomItem(['brouillon', 'envoyee', 'accepte', 'rejetee', 'en_cours', 'completee', 'annulee']),
        devis: {
          numero: `DV-${(i + 1).toString().padStart(5, '0')}`,
          montant: montantTTC,
          devise: 'EUR',
          validite: new Date(2024, 2, Math.floor(Math.random() * 28) + 1)
        },
        createdBy: clientUser._id,
        notes: `Devis pour ${site.nom}`,
        documents: []
      });
    }

    const createdQuotes = await QuoteRequest.insertMany(quotes);
    console.log(`✅ ${createdQuotes.length} demandes de devis créées`);

    // ===== RÉSUMÉ =====
    console.log('\n✅ SEEDING COMPLET!');
    console.log(`   📊 ${createdUsers.length} utilisateurs`);
    console.log(`   🏢 ${createdSites.length} sites`);
    console.log(`   🏭 ${createdBuildings.length} bâtiments`);
    console.log(`   ❄️ ${createdEquipments.length} équipements`);
    console.log(`   🔧 ${createdInterventions.length} interventions`);
    console.log(`   📋 ${createdQuotes.length} devis`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur during seeding:', error);
    process.exit(1);
  }
}

seedDatabase();
