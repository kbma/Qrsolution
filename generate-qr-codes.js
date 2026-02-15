/**
 * Script pour générer les QR codes pour tous les équipements existants
 * Utiliser: node generate-qr-codes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Equipment = require('./models/Equipment');
const { generateEquipmentQR } = require('./utils/qrcode');

const generateQRCodes = async () => {
  try {
    console.log('🔌 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/qr-solution');
    console.log('✅ Connecté à MongoDB\n');

    // Trouver tous les équipements sans QR code ou avec un QR code incomplet
    const equipmentsWithoutQR = await Equipment.find({
      $or: [
        { 'qrCode.code': { $exists: false } },
        { 'qrCode.code': null },
        { 'qrCode.code': '' },
        { 'qrCode.imageUrl': { $exists: false } },
        { 'qrCode.imageUrl': null },
        { 'qrCode.imageUrl': '' }
      ]
    });

    console.log(`📊 Équipements trouvés sans QR code: ${equipmentsWithoutQR.length}\n`);

    if (equipmentsWithoutQR.length === 0) {
      console.log('✅ Tous les équipements ont déjà un QR code valide!');
      await mongoose.connection.close();
      return;
    }

    let success = 0;
    let errors = 0;

    for (const equipment of equipmentsWithoutQR) {
      try {
        console.log(`🔄 Génération QR pour: ${equipment.nom} (${equipment._id})`);
        
        // Générer le QR code
        const qrCodeData = await generateEquipmentQR(equipment);
        
        // Mettre à jour l'équipement
        equipment.qrCode = qrCodeData;
        await equipment.save();
        
        console.log(`   ✅ QR généré: ${qrCodeData.code}`);
        success++;
      } catch (error) {
        console.error(`   ❌ Erreur pour ${equipment.nom}:`, error.message);
        errors++;
      }
    }

    console.log('\n📈 RÉSUMÉ:');
    console.log(`   ✅ Réussis: ${success}`);
    console.log(`   ❌ Erreurs: ${errors}`);
    console.log(`   📊 Total traité: ${equipmentsWithoutQR.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Terminé! Connexion fermée.');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
};

// Exécuter le script
generateQRCodes();
