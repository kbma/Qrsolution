const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const User = require('../models/User');
const { generateToken } = require('../utils/helpers');

// @route   POST /api/auth/register
// @desc    Inscription d'un nouvel utilisateur
// @access  Public (contrôlé par role)
router.post('/register', [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
  body('email').isEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  body('role').isIn(['client', 'mainteneur_externe', 'technicien']).withMessage('Rôle invalide')
], async (req, res) => {
  try {
    const { nom, prenom, email, password, telephone, role, entreprise } = req.body;
    
    // Vérifier si l'utilisateur existe déjà
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }
    
    // Créer l'utilisateur
    const user = await User.create({
      nom,
      prenom,
      email,
      password,
      telephone,
      role,
      entreprise
    });
    
    res.status(201).json({
      _id: user._id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      role: user.role,
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/auth/login
// @desc    Connexion utilisateur
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Vérifier l'email
    const user = await User.findOne({ email }).select('+password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Identifiants invalides ou compte inactif' });
    }
    
    // Vérifier le mot de passe
    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Identifiants invalides' });
    }
    
    // Recharger l'utilisateur avec les données du client
    const userWithClient = await User.findById(user._id)
      .populate('client', 'identiteJuridique.denomination logo')
      .select('-password');
    
    res.json({
      _id: userWithClient._id,
      nom: userWithClient.nom,
      prenom: userWithClient.prenom,
      email: userWithClient.email,
      role: userWithClient.role,
      client: userWithClient.client,
      token: generateToken(userWithClient._id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/auth/me
// @desc    Obtenir l'utilisateur connecté
// @access  Private
router.get('/me', require('../middleware/auth').protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('subscription')
      .populate('client', 'identiteJuridique.denomination logo');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
