const jwt = require('jsonwebtoken');

/**
 * Générer un token JWT
 * @param {String} id - ID de l'utilisateur
 * @returns {String} Token JWT
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

/**
 * Vérifier un token JWT
 * @param {String} token - Token à vérifier
 * @returns {Object} Payload décodé
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Token invalide ou expiré');
  }
};

/**
 * Générer un mot de passe temporaire
 * @returns {String} Mot de passe temporaire
 */
const generateTemporaryPassword = () => {
  return Math.random().toString(36).slice(-8);
};

/**
 * Générer un code de sécurité pour un site
 * @returns {String} Code de sécurité
 */
const generateSecurityCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Formater une date au format français
 * @param {Date} date - Date à formater
 * @returns {String} Date formatée
 */
const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

/**
 * Calculer la différence en jours entre deux dates
 * @param {Date} date1 - Première date
 * @param {Date} date2 - Deuxième date
 * @returns {Number} Nombre de jours
 */
const daysDifference = (date1, date2) => {
  const diffTime = Math.abs(date2 - date1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Générer un slug à partir d'une chaîne
 * @param {String} str - Chaîne à slugifier
 * @returns {String} Slug
 */
const slugify = (str) => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Formater un montant en TND
 * @param {Number} amount - Montant
 * @returns {String} Montant formaté
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-TN', {
    style: 'currency',
    currency: 'TND'
  }).format(amount);
};

module.exports = {
  generateToken,
  verifyToken,
  generateTemporaryPassword,
  generateSecurityCode,
  formatDate,
  daysDifference,
  slugify,
  formatCurrency
};
