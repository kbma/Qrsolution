const mongoose = require('mongoose');
const User = require('./models/User');
const Subscription = require('./models/Subscription');
require('dotenv').config();

const users = [
  {
    nom: 'Admin',
    prenom: 'Super',
    email: 'superadmin@qrsolution.com',
    password: 'admin123',
    telephone: '+216 20 123 456',
    role: 'superadmin',
    entreprise: 'QR Solution'
  },
  {
    nom: 'Dupont',
    prenom: 'Jean',
    email: 'client@test.com',
    password: 'client123',
    telephone: '+216 20 234 567',
    role: 'client',
    entreprise: 'Entreprise Test SARL'
  },
  {
    nom: 'Martin',
    prenom: 'Pierre',
    email: 'mainteneur@test.com',
    password: 'mainteneur123',
    telephone: '+216 20 345 678',
    role: 'mainteneur_interne',
    entreprise: 'Service Maintenance'
  },
  {
    nom: 'Bernard',
    prenom: 'Sophie',
    email: 'externe@test.com',
    password: 'externe123',
    telephone: '+216 20 456 789',
    role: 'mainteneur_externe',
    entreprise: 'Maintenance Externe SARL'
  },
  {
    nom: 'Technicien',
    prenom: 'Ahmed',
    email: 'technicien@test.com',
    password: 'tech123',
    telephone: '+216 20 567 890',
    role: 'technicien'
  }
];

const seedDatabase = async () => {
  try {
    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connecté à MongoDB');

    // Supprimer les données existantes
    await User.deleteMany({});
    await Subscription.deleteMany({});
    console.log('🗑️  Données existantes supprimées');

    // Créer les utilisateurs
    const createdUsers = await User.create(users);
    console.log('👥 Utilisateurs créés:', createdUsers.length);

    // Créer un abonnement pour le client
    const clientUser = createdUsers.find(u => u.role === 'client');
    if (clientUser) {
      const subscription = await Subscription.create({
        nom: 'Abonnement Standard',
        type: 'standard',
        client: clientUser._id,
        dateDebut: new Date(),
        dateFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 an
        limites: {
          nombreSites: 10,
          nombreEquipements: 100,
          nombreMainteneurs: 5,
          stockageGo: 10
        },
        utilisation: {
          nombreSites: 0,
          nombreEquipements: 0,
          nombreMainteneurs: 0,
          stockageUtilise: 0
        },
        prix: 500,
        devise: 'TND',
        statut: 'actif'
      });

      // Associer l'abonnement au client
      clientUser.subscription = subscription._id;
      await clientUser.save();
      console.log('💳 Abonnement créé pour le client');
    }

    console.log('\n🎉 Base de données initialisée avec succès!\n');
    console.log('📧 Comptes de test créés:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👑 Super Admin:');
    console.log('   Email: superadmin@qrsolution.com');
    console.log('   Password: admin123');
    console.log('');
    console.log('👤 Client:');
    console.log('   Email: client@test.com');
    console.log('   Password: client123');
    console.log('');
    console.log('🔧 Mainteneur Interne:');
    console.log('   Email: mainteneur@test.com');
    console.log('   Password: mainteneur123');
    console.log('');
    console.log('🏢 Mainteneur Externe:');
    console.log('   Email: externe@test.com');
    console.log('   Password: externe123');
    console.log('');
    console.log('⚙️  Technicien:');
    console.log('   Email: technicien@test.com');
    console.log('   Password: tech123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
};

seedDatabase();
