const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Middleware de sécurité
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://192.168.1.221:3000', process.env.FRONTEND_URL].filter(Boolean),
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limite par IP
});
app.use('/api/', limiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Fichiers statiques (uploads)
app.use('/uploads', express.static('uploads'));

// Routes API (auth n'a pas besoin d'isolation tenant)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/sites', require('./routes/siteRoutes'));
app.use('/api/buildings', require('./routes/buildings'));
app.use('/api/equipment', require('./routes/equipment'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/interventions', require('./routes/interventions'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Route de test
app.get('/', (req, res) => {
  res.json({ 
    message: 'Bienvenue sur QR Solution API',
    version: '1.0.0',
    status: 'running'
  });
});

// Route API racine
app.get('/api', (req, res) => {
  res.json({
    message: 'API QR Solution v1.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      subscriptions: '/api/subscriptions',
      sites: '/api/sites',
      buildings: '/api/buildings',
      equipment: '/api/equipment',
      maintenance: '/api/maintenance',
      interventions: '/api/interventions',
      quotes: '/api/quotes',
      orders: '/api/orders',
      dashboard: '/api/dashboard'
    }
  });
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route non trouvée' });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Erreur serveur',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Connexion MongoDB
// Vérifier que la variable d'environnement MongoDB est définie
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!mongoUri) {
  console.error('❌ MONGODB_URI non défini. Configurez le secret `MONGODB_URI` sur Render ou ajoutez-le dans .env local.');
  console.error('Voir backend/render.yaml et backend/RENDER_DEPLOY.md pour les instructions.');
  process.exit(1);
}

const connectDB = async () => {
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connecté avec succès');
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

// Démarrage du serveur
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV}`);
  });
});

module.exports = app;
