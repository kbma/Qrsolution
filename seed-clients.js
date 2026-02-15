/**
 * Script de seed pour les entreprises clientes (multi-tenant)
 * Usage: node backend/seed-clients.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const Client = require('./models/Client');
const User = require('./models/User');

// Données des 10 entreprises de test
const testClients = [
  {
    identiteJuridique: {
      denomination: 'RATP - Régie Autonome des Transports Parisiens',
      formeJuridique: 'EPIC',
      siren: '775663438',
      siret: '77566343800105',
      numeroTVA: 'FR27775663438',
      rcs: { ville: 'Paris', numero: 'B 775 663 438' },
      dateInscriptionRCS: '1949-01-01',
      capitalSocial: 1700000000
    },
    coordonnees: {
      adresse: {
        rue: '54 quai de la Rapée',
        ville: 'Paris',
        codePostal: '75599',
        pays: 'France'
      },
      telephone: '0145876000',
      email: 'contact@ratp.fr',
      siteWeb: 'https://www.ratp.fr'
    },
    responsablesLegaux: [
      { nom: 'Catherine', prenom: 'Guillouard', fonction: 'Directrice Générale', email: 'catherine.guillouard@ratp.fr', telephone: '0145876001' }
    ],
    subscription: {
      plan: 'ENTERPRISE',
      statut: 'actif',
      limites: { utilisateurs: 500, sites: 200, equipements: 10000, interventionsMois: 5000 }
    }
  },
  {
    identiteJuridique: {
      denomination: 'STEG - Société Tunisienne de l\'Electricité et du Gaz',
      formeJuridique: 'SA',
      siren: '126789012',
      siret: '12678901234567',
      numeroTVA: 'TN126789012',
      rcs: { ville: 'Tunis', numero: 'B 126 789' },
      dateInscriptionRCS: '1962-05-15',
      capitalSocial: 2000000000
    },
    coordonnees: {
      adresse: {
        rue: '38 avenue Kheireddine Pacha',
        ville: 'Tunis',
        codePostal: '1002',
        pays: 'Tunisie'
      },
      telephone: '+21671123456',
      email: 'contact@steg.com.tn',
      siteWeb: 'https://www.steg.com.tn'
    },
    responsablesLegaux: [
      { nom: 'Mourad', prenom: 'Ben Fadhl', fonction: 'Président Directeur Général', email: 'm.benfadh@steg.com.tn', telephone: '+21671123457' }
    ],
    subscription: {
      plan: 'PROFESSIONAL',
      statut: 'actif',
      limites: { utilisateurs: 200, sites: 100, equipements: 5000, interventionsMois: 2000 }
    }
  },
  {
    identiteJuridique: {
      denomination: 'SNCF - Société Nationale des Chemins de fer Français',
      formeJuridique: 'EPIC',
      siren: '552046447',
      siret: '55204644700191',
      numeroTVA: 'FR55552046447',
      rcs: { ville: 'Paris', numero: 'B 552 046 447' },
      dateInscriptionRCS: '1938-01-01',
      capitalSocial: 3000000000
    },
    coordonnees: {
      adresse: {
        rue: '15 rue Philibert Delorme',
        ville: 'Paris',
        codePostal: '75017',
        pays: 'France'
      },
      telephone: '0958701234',
      email: 'contact@sncf.fr',
      siteWeb: 'https://www.sncf.com'
    },
    responsablesLegaux: {
      nom: 'Jean-Pierre',
      prenom: 'Farandou',
      fonction: 'Président Directeur Général',
      email: 'jp.farandou@sncf.fr',
      telephone: '0958701235'
    },
    subscription: {
      plan: 'ENTERPRISE',
      statut: 'actif',
      limites: { utilisateurs: 1000, sites: 500, equipements: 20000, interventionsMois: 10000 }
    }
  },
  {
    identiteJuridique: {
      denomination: 'ENGIE',
      formeJuridique: 'SA',
      siren: '542107651',
      siret: '54210765101872',
      numeroTVA: 'FR35542107651',
      rcs: { ville: 'Courbevoie', numero: 'B 542 107 651' },
      dateInscriptionRCS: '1946-07-04',
      capitalSocial: 2435000000
    },
    coordonnees: {
      adresse: {
        rue: '1 place Samuel de Champlain',
        ville: 'Courbevoie',
        codePostal: '92400',
        pays: 'France'
      },
      telephone: '0144220000',
      email: 'contact@engie.com',
      siteWeb: 'https://www.engie.com'
    },
    responsablesLegaux: [
      { nom: 'Catherine', prenom: 'MacGregor', fonction: 'Directrice Générale', email: 'c.macgregor@engie.com', telephone: '0144220001' }
    ],
    subscription: {
      plan: 'ENTERPRISE',
      statut: 'actif',
      limites: { utilisateurs: 800, sites: 300, equipements: 15000, interventionsMois: 8000 }
    }
  },
  {
    identiteJuridique: {
      denomination: 'Veolia',
      formeJuridique: 'SA',
      siren: '403210032',
      siret: '40321003210951',
      numeroTVA: 'FR29403210032',
      rcs: { ville: 'Paris', numero: 'B 403 210 032' },
      dateInscriptionRCS: '1995-10-30',
      capitalSocial: 5500000000
    },
    coordonnees: {
      adresse: {
        rue: '30 rue Madeleine Vionnet',
        ville: 'Aubervilliers',
        codePostal: '93300',
        pays: 'France'
      },
      telephone: '0145715000',
      email: 'contact@veolia.com',
      siteWeb: 'https://www.veolia.com'
    },
    responsablesLegaux: [
      { nom: 'Antoine', prenom: 'Frérot', fonction: 'Président Directeur Général', email: 'a.frot@veolia.com', telephone: '0145715001' }
    ],
    subscription: {
      plan: 'ENTERPRISE',
      statut: 'actif',
      limites: { utilisateurs: 600, sites: 400, equipements: 12000, interventionsMois: 6000 }
    }
  },
  {
    identiteJuridique: {
      denomination: 'Suez',
      formeJuridique: 'SA',
      siren: '433650570',
      siret: '43365057010730',
      numeroTVA: 'FR56433650570',
      rcs: { ville: 'Paris', numero: 'B 433 650 570' },
      dateInscriptionRCS: '2000-01-14',
      capitalSocial: 2000000000
    },
    coordonnees: {
      adresse: {
        rue: '16 place de l\'Iris',
        ville: 'Courbevoie',
        codePostal: '92400',
        pays: 'France'
      },
      telephone: '0140812000',
      email: 'contact@suez.com',
      siteWeb: 'https://www.suez.com'
    },
    responsablesLegaux: [
      { nom: 'Bertrand', prenom: 'Camus', fonction: 'Président Directeur Général', email: 'b.camus@suez.com', telephone: '0140812001' }
    ],
    subscription: {
      plan: 'PROFESSIONAL',
      statut: 'actif',
      limites: { utilisateurs: 400, sites: 200, equipements: 8000, interventionsMois: 4000 }
    }
  },
  {
    identiteJuridique: {
      denomination: 'TotalEnergies',
      formeJuridique: 'SA',
      siren: '542051180',
      siret: '54205118056886',
      numeroTVA: 'FR20542051180',
      rcs: { ville: 'Courbevoie', numero: 'B 542 051 180' },
      dateInscriptionRCS: '1924-03-28',
      capitalSocial: 6600000000
    },
    coordonnees: {
      adresse: {
        rue: '2 place Jean Millier',
        ville: 'Courbevoie',
        codePostal: '92400',
        pays: 'France'
      },
      telephone: '0147444545',
      email: 'contact@totalenergies.com',
      siteWeb: 'https://www.totalenergies.com'
    },
    responsablesLegaux: [
      { nom: 'Patrick', prenom: 'Pouyanné', fonction: 'Président Directeur Général', email: 'p.pouyanne@totalenergies.com', telephone: '0147444546' }
    ],
    subscription: {
      plan: 'ENTERPRISE',
      statut: 'actif',
      limites: { utilisateurs: 1200, sites: 600, equipements: 25000, interventionsMois: 12000 }
    }
  },
  {
    identiteJuridique: {
      denomination: 'Cie de Saint-Gobain',
      formeJuridique: 'SA',
      siren: '572079553',
      siret: '57207955300135',
      numeroTVA: 'FR20572079553',
      rcs: { ville: 'Courbevoie', numero: 'B 572 079 553' },
      dateInscriptionRCS: '1985-07-25',
      capitalSocial: 2100000000
    },
    coordonnees: {
      adresse: {
        rue: '12 place de l\'Iris',
        ville: 'Courbevoie',
        codePostal: '92400',
        pays: 'France'
      },
      telephone: '0147623000',
      email: 'contact@saint-gobain.com',
      siteWeb: 'https://www.saint-gobain.com'
    },
    responsablesLegaux: [
      { nom: 'Pierre-André', prenom: 'de Chalendar', fonction: 'Président Directeur Général', email: 'p.dechalandar@saint-gobain.com', telephone: '0147623001' }
    ],
    subscription: {
      plan: 'PROFESSIONAL',
      statut: 'actif',
      limites: { utilisateurs: 300, sites: 150, equipements: 6000, interventionsMois: 3000 }
    }
  },
  {
    identiteJuridique: {
      denomination: 'Vinci',
      formeJuridique: 'SA',
      siren: '552037804',
      siret: '55203780400143',
      numeroTVA: 'FR55552037804',
      rcs: { ville: 'Rueil-Malmaison', numero: 'B 552 037 804' },
      dateInscriptionRCS: '1899-11-20',
      capitalSocial: 1450000000
    },
    coordonnees: {
      adresse: {
        rue: '1 cours Ferdinand de Lesseps',
        ville: 'Rueil-Malmaison',
        codePostal: '92500',
        pays: 'France'
      },
      telephone: '0147100100',
      email: 'contact@vinci.com',
      siteWeb: 'https://www.vinci.com'
    },
    responsablesLegaux: [
      { nom: 'Xavier', prenom: 'Huillard', fonction: 'Président Directeur Général', email: 'x.huillard@vinci.com', telephone: '0147100101' }
    ],
    subscription: {
      plan: 'ENTERPRISE',
      statut: 'actif',
      limites: { utilisateurs: 700, sites: 350, equipements: 14000, interventionsMois: 7000 }
    }
  },
  {
    identiteJuridique: {
      denomination: 'Bouygues',
      formeJuridique: 'SA',
      siren: '572015246',
      siret: '57201524600138',
      numeroTVA: 'FR20572015246',
      rcs: { ville: 'Paris', numero: 'B 572 015 246' },
      dateInscriptionRCS: '1953-04-13',
      capitalSocial: 1430000000
    },
    coordonnees: {
      adresse: {
        rue: '32 avenue Hoche',
        ville: 'Paris',
        codePostal: '75008',
        pays: 'France'
      },
      telephone: '0144201000',
      email: 'contact@bouygues.com',
      siteWeb: 'https://www.bouygues.com'
    },
    responsablesLegaux: [
      { nom: 'Martin', prenom: 'Bouygues', fonction: 'Président Directeur Général', email: 'm.bouygues@bouygues.com', telephone: '0144201001' }
    ],
    subscription: {
      plan: 'PROFESSIONAL',
      statut: 'actif',
      limites: { utilisateurs: 500, sites: 250, equipements: 10000, interventionsMois: 5000 }
    }
  }
];

// Mot de passe temporaire par défaut pour les admins
const TEMP_PASSWORD = 'admin123';

// Fonction pour générer un tenantId unique
generateTenantId = () => 'TNT-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();

async function seedClients() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    // Supprimer les anciens clients de test
    const deleteResult = await Client.deleteMany({});
    console.log(`🗑️ ${deleteResult.deletedCount} clients supprimés`);
    
    // Supprimer les utilisateurs clients de test
    await User.deleteMany({ role: 'client_admin' });
    console.log('🗑️ Utilisateurs client_admin supprimés');

    // Ajouter tenantId à chaque client
    const clientsWithTenantId = testClients.map(client => ({
      ...client,
      tenantId: generateTenantId()
    }));

    // Insérer les nouveaux clients
    const clients = await Client.insertMany(clientsWithTenantId);
    console.log(`✅ ${clients.length} clients insérés`);

    // Créer un admin pour chaque client
    const adminUsers = [];
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      // Générer un email admin basé sur le nom de l'entreprise
      const companyName = client.identiteJuridique.denomination.split(' ')[0].toLowerCase();
      const adminEmail = `admin@${companyName.replace(/[^a-z]/g, '')}.${client.identiteJuridique.formeJuridique === 'SA' || client.identiteJuridique.formeJuridique === 'SARL' ? 'com' : 'fr'}`;
      
      // Prénom et nom du responsable légal
      const responsable = Array.isArray(client.responsablesLegaux) 
        ? client.responsablesLegaux[0] 
        : client.responsablesLegaux;

      // Hasher le mot de passe AVANT de créer l'utilisateur
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(TEMP_PASSWORD, salt);

      const adminUser = {
        nom: responsable.nom,
        prenom: responsable.prenom,
        email: adminEmail,
        telephone: responsable.telephone,
        password: hashedPassword,
        role: 'client_admin',
        client: client._id,
        tenantId: client.tenantId,
        isActive: true,
        isFirstLogin: true,
        preferences: {
          notifications: true,
          language: 'fr'
        }
      };
      adminUsers.push(adminUser);
    }

    // Utiliser insertMany avec des mots de passe déjà hashés
    const users = await User.insertMany(adminUsers);
    console.log(`✅ ${users.length} utilisateurs admin créés`);

    // Mettre à jour les clients avec les IDs des admins
    for (let i = 0; i < clients.length; i++) {
      await Client.findByIdAndUpdate(clients[i]._id, {
        $set: { 
          'subscription.adminUserId': users[i]._id,
          'identiteJuridique.logo': '',
          'identiteJuridique.couleurLogo': '#0066cc'
        }
      });
    }
    console.log('✅ Clients mis à jour avec les IDs admin');

    console.log('\n🎉 Seed terminé avec succès!');
    console.log('\n📋 Résumé:');
    console.log(`   - ${clients.length} entreprises créées`);
    console.log(`   - ${users.length} administrateurs créés`);
    console.log(`   - Mot de passe temporaire: ${TEMP_PASSWORD}`);

    await mongoose.disconnect();
    console.log('\n🔌 Déconnecté de MongoDB');
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

seedClients();
