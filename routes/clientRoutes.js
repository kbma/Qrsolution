const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configuration Multer pour les logos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/logos/');
  },
  filename: function (req, file, cb) {
    cb(null, 'logo-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5000000 }, // 5MB
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Images (jpeg, jpg, png, webp) uniquement!'));
  }
});

const {
  getClients,
  createClient,
  getClientById,
  updateClient,
  archiveClient,
  resetClientAdminPassword
} = require('../controllers/userController');

// Protection : SuperAdmin uniquement
router.use(protect);
router.use(authorize('superadmin'));

router.route('/')
  .get(getClients)
  .post(upload.single('logo'), createClient);

router.route('/:id')
  .get(getClientById)
  .put(upload.single('logo'), updateClient);

router.put('/:id/archive', archiveClient);
router.post('/:id/reset-admin-password', resetClientAdminPassword);

module.exports = router;