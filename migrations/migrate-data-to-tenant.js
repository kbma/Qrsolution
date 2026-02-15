// Script de migration pour ajouter tenantId aux données existantes
// Ce script relie les données existantes aux clients correspondants

const mongoose = require('mongoose');
const Client = require('../models/Client');
const User = require('../models/User');
const Equipment = require('../models/Equipment');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Intervention = require('../models/Intervention');
const Quote = require('../models/Quote');
const Order = require('../models/Order');

require('dotenv').config();

async function migrateDataToTenant() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/qr-solution');
    console.log('✅ Connecté à MongoDB');

    // Récupérer tous les clients avec leur tenantId
    const clients = await Client.find({});
    console.log(`📊 ${clients.length} clients trouvés`);

    // Créer une map clientId -> tenantId
    const clientTenantMap = {};
    clients.forEach(client => {
      clientTenantMap[client._id.toString()] = client.tenantId;
    });

    // Pour chaque client, trouver et mettre à jour ses données
    for (const client of clients) {
      console.log(`\n🔄 Traitement du client: ${client.identiteJuridique.denomination} (${client.tenantId})`);

      // 1. Mettre à jour les utilisateurs
      const users = await User.updateMany(
        { client: client._id, tenantId: { $exists: false } },
        { $set: { tenantId: client.tenantId } }
      );
      console.log(`   👤 ${users.modifiedCount} utilisateurs mis à jour`);

      // 2. Mettre à jour les sites
      const sites = await Site.updateMany(
        { clientRef: client._id, tenantId: { $exists: false } },
        { $set: { tenantId: client.tenantId } }
      );
      console.log(`   📍 ${sites.modifiedCount} sites mis à jour`);

      // 3. Mettre à jour les bâtiments
      const buildings = await Building.updateMany(
        { clientRef: client._id, tenantId: { $exists: false } },
        { $set: { tenantId: client.tenantId } }
      );
      console.log(`   🏢 ${buildings.modifiedCount} bâtiments mis à jour`);

      // 4. Mettre à jour les équipements (via site)
      const clientSites = await Site.find({ clientRef: client._id }).select('_id');
      const siteIds = clientSites.map(s => s._id);
      
      if (siteIds.length > 0) {
        const equipment = await Equipment.updateMany(
          { site: { $in: siteIds }, tenantId: { $exists: false } },
          { $set: { tenantId: client.tenantId } }
        );
        console.log(`   🔧 ${equipment.modifiedCount} équipements mis à jour`);
      }

      // 5. Mettre à jour les interventions (via site ou equipment)
      if (siteIds.length > 0) {
        const interventions = await Intervention.updateMany(
          { site: { $in: siteIds }, tenantId: { $exists: false } },
          { $set: { tenantId: client.tenantId } }
        );
        console.log(`   🛠️ ${interventions.modifiedCount} interventions mises à jour`);
      }

      // 6. Mettre à jour les devis
      const quotes = await Quote.updateMany(
        { clientRef: client._id, tenantId: { $exists: false } },
        { $set: { tenantId: client.tenantId } }
      );
      console.log(`   📄 ${quotes.modifiedCount} devis mis à jour`);

      // 7. Mettre à jour les commandes
      const orders = await Order.updateMany(
        { client: { $in: await User.find({ client: client._id }).select('_id') }, tenantId: { $exists: false } },
        { $set: { tenantId: client.tenantId } }
      );
      console.log(`   📦 ${orders.modifiedCount} commandes mises à jour`);
    }

    // Traiter les utilisateurs sans client (legacy ou superadmin)
    const superadmin = await User.findOne({ role: 'superadmin' });
    if (superadmin && !superadmin.tenantId) {
      await User.updateOne(
        { _id: superadmin._id },
        { $set: { tenantId: 'SUPERADMIN' } }
      );
      console.log('\n✅ Superadmin mis à jour avec tenantId=SUPERADMIN');
    }

    console.log('\n🎉 Migration terminée avec succès !');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    process.exit(1);
  }
}

migrateDataToTenant();
