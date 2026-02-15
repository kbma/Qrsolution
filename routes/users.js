const express = require('express');
const router = express.Router();
const { protect, authorize, checkSubscription } = require('../middleware/auth');
const { tenantIsolation } = require('../middleware/tenantIsolation');
const {
  getUsers,
  getUserById,
  createUser,
  createPartner,
  createClient,
  updateUser,
  toggleUserActive,
  deleteUser,
  getUsersStats,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  resetUserPassword,
  resetMyPassword,
  impersonateUser
} = require('../controllers/userController');

// Appliquer l'isolation multi-tenant
router.use(protect);
router.use(tenantIsolation);

// Statistiques
router.get('/stats/summary', protect, getUsersStats);

// Profil de l'utilisateur connecté
router.get('/profile/me', protect, getMyProfile);
router.put('/profile/me', protect, updateMyProfile);
router.put('/profile/change-password', protect, changeMyPassword);

// Routes principales
router.route('/')
  .get(protect, authorize('superadmin', 'client_admin', 'responsable_affaires'), getUsers)
  .post(protect, authorize('superadmin', 'client_admin'), createUser);

// Créer un partenaire
router.post('/partner', protect, authorize('superadmin', 'client_admin'), createPartner);

router.route('/:id')
  .get(protect, getUserById)
  .put(protect, authorize('superadmin', 'client_admin'), updateUser)
  .delete(protect, authorize('superadmin'), deleteUser);

// Actions utilisateurs
router.put('/:id/toggle-active', protect, authorize('superadmin', 'client_admin'), toggleUserActive);

// Réinitialiser le mot de passe (Super Admin uniquement)
router.post('/:id/reset-password', protect, authorize('superadmin'), resetUserPassword);

// Réinitialiser son propre mot de passe (utilisateur connecté)
router.post('/reset-my-password', protect, resetMyPassword);

// Impersonation (Super Admin uniquement)
router.post('/:id/impersonate', protect, authorize('superadmin'), impersonateUser);

module.exports = router;
