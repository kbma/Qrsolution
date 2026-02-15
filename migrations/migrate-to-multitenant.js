/**
 * Script de migration vers l'architecture multi-tenant
 * 
 * Ce script doit être exécuté avec Node.js:
 * node migrations/migrate-to-multitenant.js
 * 
 * AVANT D'EXÉCUTER:
 * 1. Faire une sauvegarde complète de la base de données
 * 2. Tester ce script en environnement staging
 * 3. Vérifier que tous les modèles sont à jour
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import des modèles
const User = require('../models/User');
const Client = require('../models/Client');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Equipment = require('../models/Equipment');
const Intervention = require('../models/Intervention');
const Quote = require('../models/Quote');

const MIGRATION_LOG = [];

async function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${type}] ${message}`;
  console.log(logEntry);
  MIGRATION_LOG.push(logEntry);
}

async function migrate() {
  try {
    log('========================================');
    log('DÉBUT DE LA MIGRATION MULTI-TENANT');
    log('========================================');
    
    // Connexion à MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/qr-solution';
    log(`Connexion à MongoDB: ${mongoUri}`);
    await mongoose.connect(mongoUri);
    log('✅ Connexion MongoDB établie');
    
    // Étape 1: Créer les clients à partir des utilisateurs "client"
    log('----------------------------------------');
    log('ÉTAPE 1: Création des Clients');
    log('----------------------------------------');
    
    const clientUsers = await User.find({ 
      $or: [
        { role: 'client' },
        { role: 'gerant' },
        { identiteJuridique: { $exists: true, $ne: null } }
      ]
    });
    
    log(`Trouvé ${clientUsers.length} utilisateurs avec informations client`);
    
    const clientMap = new Map(); // Pour stocker la correspondance User -> Client
    
    for (const user of clientUsers) {
      try {
        // Vérifier si un client existe déjà pour ce SIREN
        const existingClient = await Client.findOne({
          'identiteJuridique.siren': user.identiteJuridique?.siren
        });
        
        if (existingClient) {
          log(`Client existant trouvé pour ${user.identiteJuridique?.denomination || user.email}`);
          clientMap.set(user._id.toString(), existingClient._id);
          continue;
        }
        
        // Créer un nouveau client
        if (user.identiteJuridique || user.entreprise) {
          const client = new Client({
            tenantId: 'TNT-' + Date.now().toString(36).toUpperCase() + 
                     Math.random().toString(36).substring(2, 6).toUpperCase(),
            identiteJuridique: user.identiteJuridique || {
              denomination: user.entreprise,
              formeJuridique: 'SARL',
              siren: 'NON DÉFINI-' + Date.now()
            },
            logo: user.logo,
            coordonnees: {
              email: user.email,
              telephone: user.telephone
            },
            responsablesLegaux: user.identiteJuridique?.responsablesLegaux || [{
              nom: user.nom,
              prenom: user.prenom,
              fonction: user.role === 'gerant' ? 'Gérant' : 'Responsable'
            }],
            subscription: {
              plan: 'STARTER',
              statut: 'actif',
              dateDebut: new Date(),
              dateExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 an
              limites: {
                utilisateurs: 5,
                sites: 10,
                equipements: 100,
                interventionsMois: 50
              }
            },
            creePar: user._id
          });
          
          await client.save();
          log(`✅ Client créé: ${client.tenantId} - ${client.identiteJuridique?.denomination || 'Sans nom'}`);
          clientMap.set(user._id.toString(), client._id);
        }
      } catch (error) {
        log(`Erreur lors de la création du client pour ${user.email}: ${error.message}`, 'ERROR');
      }
    }
    
    log(`Total: ${clientMap.size} clients créés/mappés`);
    
    // Étape 2: Mettre à jour les utilisateurs avec tenantId
    log('----------------------------------------');
    log('ÉTAPE 2: Mise à jour des Utilisateurs');
    log('----------------------------------------');
    
    const allUsers = await User.find();
    let usersUpdated = 0;
    
    for (const user of allUsers) {
      try {
        if (user.role === 'superadmin') {
          user.tenantId = 'SUPERADMIN';
          user.roleLegacy = 'superadmin';
        } else if (clientMap.has(user._id.toString())) {
          const clientId = clientMap.get(user._id.toString());
          const client = await Client.findById(clientId);
          if (client) {
            user.client = clientId;
            user.tenantId = client.tenantId;
            user.roleLegacy = user.role;
            
            // Mapper les rôles legacy vers les nouveaux rôles
            if (user.role === 'client' || user.role === 'gerant') {
              user.role = 'client_admin';
            }
            
            await user.save();
            usersUpdated++;
          }
        }
      } catch (error) {
        log(`Erreur lors de la mise à jour de l'utilisateur ${user.email}: ${error.message}`, 'ERROR');
      }
    }
    
    log(`Utilisateurs mis à jour: ${usersUpdated}/${allUsers.length}`);
    
    // Étape 3: Mettre à jour les Sites
    log('----------------------------------------');
    log('ÉTAPE 3: Mise à jour des Sites');
    log('----------------------------------------');
    
    const sites = await Site.find();
    let sitesUpdated = 0;
    
    for (const site of sites) {
      try {
        if (site.client) {
          const clientId = clientMap.get(site.client.toString());
          if (clientId) {
            const client = await Client.findById(clientId);
            if (client) {
              site.clientRef = clientId;
              site.tenantId = client.tenantId;
              await site.save();
              sitesUpdated++;
            }
          }
        } else if (!site.tenantId) {
          // Site sans client, générer un tenantId temporaire
          site.tenantId = 'TNT-ORPHAN-' + site._id.toString().substring(0, 8);
          await site.save();
          sitesUpdated++;
        }
      } catch (error) {
        log(`Erreur lors de la mise à jour du site ${site.nom}: ${error.message}`, 'ERROR');
      }
    }
    
    log(`Sites mis à jour: ${sitesUpdated}/${sites.length}`);
    
    // Étape 4: Mettre à jour les Bâtiments
    log('----------------------------------------');
    log('ÉTAPE 4: Mise à jour des Bâtiments');
    log('----------------------------------------');
    
    const buildings = await Building.find();
    let buildingsUpdated = 0;
    
    for (const building of buildings) {
      try {
        if (building.site) {
          const site = await Site.findById(building.site);
          if (site && site.tenantId) {
            building.tenantId = site.tenantId;
            building.clientRef = site.clientRef;
            await building.save();
            buildingsUpdated++;
          }
        }
      } catch (error) {
        log(`Erreur lors de la mise à jour du bâtiment ${building.nom}: ${error.message}`, 'ERROR');
      }
    }
    
    log(`Bâtiments mis à jour: ${buildingsUpdated}/${buildings.length}`);
    
    // Étape 5: Mettre à jour les Équipements
    log('----------------------------------------');
    log('ÉTAPE 5: Mise à jour des Équipements');
    log('----------------------------------------');
    
    const equipments = await Equipment.find();
    let equipmentsUpdated = 0;
    
    for (const equipment of equipments) {
      try {
        if (equipment.site) {
          const site = await Site.findById(equipment.site);
          if (site && site.tenantId) {
            equipment.tenantId = site.tenantId;
            equipment.clientRef = site.clientRef;
            await equipment.save();
            equipmentsUpdated++;
          }
        }
      } catch (error) {
        log(`Erreur lors de la mise à jour de l'équipement ${equipment.nom}: ${error.message}`, 'ERROR');
      }
    }
    
    log(`Équipements mis à jour: ${equipmentsUpdated}/${equipments.length}`);
    
    // Étape 6: Mettre à jour les Interventions
    log('----------------------------------------');
    log('ÉTAPE 6: Mise à jour des Interventions');
    log('----------------------------------------');
    
    const interventions = await Intervention.find();
    let interventionsUpdated = 0;
    
    for (const intervention of interventions) {
      try {
        if (intervention.site) {
          const site = await Site.findById(intervention.site);
          if (site && site.tenantId) {
            intervention.tenantId = site.tenantId;
            intervention.clientRef = site.clientRef;
            await intervention.save();
            interventionsUpdated++;
          }
        }
      } catch (error) {
        log(`Erreur lors de la mise à jour de l'intervention ${intervention.numero}: ${error.message}`, 'ERROR');
      }
    }
    
    log(`Interventions mises à jour: ${interventionsUpdated}/${interventions.length}`);
    
    // Étape 7: Mettre à jour les Devis
    log('----------------------------------------');
    log('ÉTAPE 7: Mise à jour des Devis');
    log('----------------------------------------');
    
    const quotes = await Quote.find();
    let quotesUpdated = 0;
    
    for (const quote of quotes) {
      try {
        if (!quote.tenantId) {
          if (quote.demandeur) {
            const user = await User.findById(quote.demandeur);
            if (user && user.tenantId) {
              quote.tenantId = user.tenantId;
            }
          }
          if (!quote.tenantId && quote.site) {
            const site = await Site.findById(quote.site);
            if (site && site.tenantId) {
              quote.tenantId = site.tenantId;
              quote.clientRef = site.clientRef;
            }
          }
          if (quote.tenantId) {
            await quote.save();
            quotesUpdated++;
          }
        }
      } catch (error) {
        log(`Erreur lors de la mise à jour du devis ${quote.numero}: ${error.message}`, 'ERROR');
      }
    }
    
    log(`Devis mis à jour: ${quotesUpdated}/${quotes.length}`);
    
    // Résumé
    log('========================================');
    log('RÉSUMÉ DE LA MIGRATION');
    log('========================================');
    log(`Clients créés: ${clientMap.size}`);
    log(`Utilisateurs mis à jour: ${usersUpdated}`);
    log(`Sites mis à jour: ${sitesUpdated}`);
    log(`Bâtiments mis à jour: ${buildingsUpdated}`);
    log(`Équipements mis à jour: ${equipmentsUpdated}`);
    log(`Interventions mises à jour: ${interventionsUpdated}`);
    log(`Devis mis à jour: ${quotesUpdated}`);
    log('========================================');
    log('MIGRATION TERMINÉE AVEC SUCCÈS');
    log('========================================');
    
    // Sauvegarder le log de migration
    const fs = require('fs');
    const migrationLogDir = './logs';
    if (!fs.existsSync(migrationLogDir)) {
      fs.mkdirSync(migrationLogDir, { recursive: true });
    }
    fs.writeFileSync(
      `./logs/migration-${Date.now()}.log`,
      MIGRATION_LOG.join('\n')
    );
    log(`Log de migration sauvegardé dans logs/migration-${Date.now()}.log`);
    
  } catch (error) {
    log(`ERREUR CRITIQUE: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
  } finally {
    await mongoose.disconnect();
    log('Connexion MongoDB fermée');
  }
}

// Exécuter la migration
migrate();
