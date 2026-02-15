const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs').promises;

/**
 * Générer un code QR unique
 * @param {String} type - Type d'entité (equipment, site, etc.)
 * @param {String} id - ID de l'entité
 * @returns {String} Code QR unique
 */
const generateQRCode = (type, id) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${type.toUpperCase()}-${id}-${timestamp}-${random}`;
};

/**
 * Créer une image QR Code
 * @param {String} data - Données à encoder
 * @param {String} filename - Nom du fichier
 * @returns {Promise<String>} URL de l'image
 */
const createQRCodeImage = async (data, filename) => {
  try {
    const uploadDir = path.join(__dirname, '../uploads/qrcodes');
    
    // Créer le dossier s'il n'existe pas
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }
    
    const filepath = path.join(uploadDir, `${filename}.png`);
    
    await QRCode.toFile(filepath, data, {
      errorCorrectionLevel: 'H',
      type: 'png',
      quality: 0.92,
      margin: 1,
      width: 300,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    return `/uploads/qrcodes/${filename}.png`;
  } catch (error) {
    console.error('Erreur génération QR Code:', error);
    throw new Error('Échec de la génération du QR Code');
  }
};

/**
 * Générer QR Code pour équipement
 * @param {Object} equipment - Objet équipement
 * @returns {Promise<Object>} QR Code data
 */
const generateEquipmentQR = async (equipment) => {
  const code = generateQRCode('EQP', equipment._id);
  const qrData = JSON.stringify({
    type: 'equipment',
    id: equipment._id,
    code: code,
    nom: equipment.nom,
    site: equipment.site,
    url: `${process.env.FRONTEND_URL}/scan/${code}`
  });
  
  const imageUrl = await createQRCodeImage(qrData, code);
  
  return {
    code,
    imageUrl,
    generatedAt: new Date()
  };
};

/**
 * Valider un code QR
 * @param {String} code - Code QR à valider
 * @returns {Boolean}
 */
const validateQRCode = (code) => {
  const pattern = /^[A-Z]{3}-[a-f0-9]{24}-\d{13}-[a-z0-9]{13}$/;
  return pattern.test(code);
};

/**
 * Décoder les données d'un QR Code
 * @param {String} qrData - Données QR encodées
 * @returns {Object} Données décodées
 */
const decodeQRData = (qrData) => {
  try {
    return JSON.parse(qrData);
  } catch (error) {
    throw new Error('QR Code invalide ou corrompu');
  }
};

module.exports = {
  generateQRCode,
  createQRCodeImage,
  generateEquipmentQR,
  validateQRCode,
  decodeQRData
};
