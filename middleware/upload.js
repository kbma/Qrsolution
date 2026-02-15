const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Créer les répertoires s'ils n'existent pas
const uploadDirs = [
  'uploads/avatars',
  'uploads/documents',
  'uploads/images',
  'uploads/plans3d',
  'uploads/equipment-docs',
  'uploads/maintenance-reports',
  'uploads/sites',
  'uploads/sites/documents'
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configuration du stockage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/';
    
    // Organiser par type de fichier
    if (file.fieldname === 'avatar' || file.fieldname === 'logo') {
      uploadPath += 'avatars/';
    } else if (file.fieldname === 'photos') {
      uploadPath += 'sites/';
    } else if (file.fieldname === 'documents' || file.fieldname === 'equipmentDocs') {
      if (req.originalUrl && req.originalUrl.includes('/sites/')) {
        uploadPath += 'sites/documents/';
      } else {
        uploadPath += 'equipment-docs/';
      }
    } else if (file.fieldname === 'images' || file.fieldname === 'equipmentImages') {
      uploadPath += 'images/';
    } else if (file.fieldname === 'plans3d') {
      uploadPath += 'plans3d/';
    } else if (file.fieldname === 'maintenanceReports') {
      uploadPath += 'maintenance-reports/';
    } else {
      uploadPath += 'documents/';
    }
    
    // Créer le répertoire s'il n'existe pas
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Filtre de fichiers amélioré
const fileFilter = (req, file, cb) => {
  // Types de fichiers autorisés
  const allowedTypes = {
    images: /jpeg|jpg|png|gif|webp/i,
    documents: /pdf|doc|docx|xls|xlsx|txt|ppt|pptx/i,
    equipmentDocs: /pdf|doc|docx|xls|xlsx|txt|ppt|pptx/i,
    equipmentImages: /jpeg|jpg|png|gif|webp/i,
    plans3d: /dwg|dxf|obj|fbx|gltf|glb/i,
    avatar: /jpeg|jpg|png|gif/i,
    logo: /jpeg|jpg|png|gif/i,
    maintenanceReports: /pdf|doc|docx/i,
    photos: /jpeg|jpg|png|gif|webp/i
  };
  
  const extname = path.extname(file.originalname).toLowerCase().slice(1);
  const fieldType = file.fieldname;
  
  let isValid = false;
  
  if (fieldType in allowedTypes) {
    isValid = allowedTypes[fieldType].test(extname);
  } else {
    // Par défaut, autoriser images et documents
    isValid = /jpeg|jpg|png|gif|pdf|doc|docx/i.test(extname);
  }
  
  if (isValid) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${extname}`), false);
  }
};

// Configuration de multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: process.env.MAX_FILE_SIZE || 50 * 1024 * 1024 // 50MB par défaut pour PDF/plans
  },
  fileFilter: fileFilter
});

// Exports spécifiques pour différents cas d'usage
const uploadMiddleware = {
  // Avatar utilisateur (1 fichier)
  avatar: upload.single('avatar'),
  
  // Logo entreprise (1 fichier)
  logo: upload.single('logo'),
  
  // Documents équipement (un fichier à la fois)
  equipmentDocs: upload.single('equipmentDocs'),
  
  // Images équipement (un fichier à la fois)
  equipmentImages: upload.single('equipmentImages'),
  
  // Documents équipement (plusieurs fichiers)
  equipmentDocsMultiple: upload.array('documents', 10),
  
  // Images équipement (plusieurs fichiers)
  equipmentImagesMultiple: upload.array('images', 10),
  
  // Mixed: documents + images (plusieurs fichiers)
  equipmentFull: upload.fields([
    { name: 'documents', maxCount: 10 },
    { name: 'images', maxCount: 10 }
  ]),
  
  // Rapports de maintenance (plusieurs fichiers)
  maintenanceReports: upload.array('maintenanceReports', 5),
  
  // Generic upload
  generic: upload.array('files', 20),

  // Sites
  sitePhotos: upload.array('photos', 10),
  
  // Site documents
  siteDocuments: upload.array('documents', 10),

  // Devis (fichier principal)
  quoteDevis: upload.single('devis'),

  // Documents Devis (pièces jointes)
  quoteDoc: upload.single('document')
};

// Gestionnaire d'erreurs pour multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Fichier trop volumineux (max 50MB)' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, message: 'Trop de fichiers à la fois' });
    }
    return res.status(400).json({ success: false, message: `Erreur upload: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

module.exports = { upload, uploadMiddleware, handleMulterError };
