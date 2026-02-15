require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const { generateToken } = require('./utils/helpers');

const Client = require('./models/Client');
const User = require('./models/User');
const Site = require('./models/Site');
const Equipment = require('./models/Equipment');
const Quote = require('./models/Quote');
const Notification = require('./models/Notification');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find or create clients
    let clientA = await Client.findOne({ 'coordonnees.email': 'admin@bouygues.com' });
    if (!clientA) {
      clientA = await Client.create({
        identiteJuridique: { denomination: 'Bouygues Test', siren: 'SIREN' + Date.now(), siret: 'SIRET' + Date.now() },
        coordonnees: { email: 'admin@bouygues.com' }
      });
    }

    let clientB = await Client.findOne({ 'coordonnees.email': 'user2@gmail.com' });
    if (!clientB) {
      clientB = await Client.create({
        identiteJuridique: { denomination: 'User2 Company', siren: 'SIREN' + (Date.now()+1), siret: 'SIRET' + (Date.now()+1) },
        coordonnees: { email: 'user2@gmail.com' }
      });
    }

    // Find or create users
    let requester = await User.findOne({ email: 'admin@bouygues.com' });
    if (!requester) {
      requester = new User({ nom: 'Admin', prenom: 'Bouygues', email: 'admin@bouygues.com', password: 'Password123!', role: 'client_admin', client: clientA._id, tenantId: clientA.tenantId });
      await requester.save();
    }

    let recipient = await User.findOne({ email: 'user2@gmail.com' });
    if (!recipient) {
      recipient = new User({ nom: 'User2', prenom: 'Test', email: 'user2@gmail.com', password: 'Password123!', role: 'mainteneur_externe', client: clientB._id, tenantId: clientB.tenantId });
      await recipient.save();
    }

    console.log('Created users:', requester.email, recipient.email);

    // Create site under clientA
    const site = new Site({ nom: 'Site Bouygues Test', client: requester._id, clientRef: clientA._id, tenantId: clientA.tenantId, codeSecurite: 'SEC' + Date.now(), coordonnees: { latitude: 0, longitude: 0 }, location: { type: 'Point', coordinates: [0,0] } });
    await site.save();

    // Create equipment under site
    const equipment = new Equipment({ nom: 'hhfhg', codeEquipement: 'HHFHG-' + Date.now(), codeLocalisation: 'LOC-'+Date.now(), site: site._id, type: 'climatisation', createdBy: requester._id, tenantId: clientA.tenantId });
    await equipment.save();

    console.log('Created site and equipment:', site._id.toString(), equipment._id.toString());

    // Create quote with response from recipient
    const quote = new Quote({
      numero: 'DEV-TEST-' + Date.now(),
      tenantId: clientA.tenantId,
      demandeur: requester._id,
      typeDemandeur: 'client',
      destinataire: recipient._id,
      destinataires: [recipient._id],
      site: site._id,
      equipment: equipment._id,
      objet: 'Test intervention',
      description: 'Description',
      typeTravaux: 'maintenance',
      responses: [ { destinataire: recipient._id, statut: 'reponse_envoyee' } ]
    });
    await quote.save();

    const responseId = quote.responses[0]._id;
    console.log('Created quote:', quote._id.toString(), 'responseId:', responseId.toString());

    // Generate tokens
    const tokenRequester = generateToken(requester._id.toString());
    const tokenRecipient = generateToken(recipient._id.toString());

    // Check equipment list as recipient (should NOT see hhfhg)
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000';
    const listBefore = await axios.get(`${baseUrl}/api/equipment`, { headers: { Authorization: `Bearer ${tokenRecipient}` } });
    const foundBefore = (listBefore.data.data || []).some(e => e._id === equipment._id.toString());
    console.log('Recipient sees equipment before acceptance?', foundBefore);

    if (foundBefore) {
      console.error('Test failed: recipient should NOT see equipment before acceptance');
    }

    // Prevent duplicate numeroCommande generation collision by pre-setting a unique numeroCommande
    await Quote.findByIdAndUpdate(quote._id, { numeroCommande: 'CMD-TEST-' + Date.now() });

    // Accept the response as requester
    await axios.patch(`${baseUrl}/api/quotes/${quote._id.toString()}/responses/${responseId.toString()}`, { status: 'accepte' }, { headers: { Authorization: `Bearer ${tokenRequester}` } });
    console.log('Requester accepted the response');

    // Allow some time and refresh quote from DB
    const updatedQuote = await Quote.findById(quote._id);
    console.log('Quote status after acceptance:', updatedQuote.statut);

    // Check notification
    const notif = await Notification.findOne({ recipient: recipient._id, type: 'quote_response' }).lean();
    console.log('Notification created for recipient?', !!notif);

    // Check equipment list as recipient AFTER acceptance
    const listAfter = await axios.get(`${baseUrl}/api/equipment`, { headers: { Authorization: `Bearer ${tokenRecipient}` } });
    const foundAfter = (listAfter.data.data || []).some(e => e._id === equipment._id.toString());
    console.log('Recipient sees equipment after acceptance?', foundAfter);

    // Try get equipment by id as recipient
    try {
      const getEquip = await axios.get(`${baseUrl}/api/equipment/${equipment._id.toString()}`, { headers: { Authorization: `Bearer ${tokenRecipient}` } });
      console.log('GET equipment by id succeeded after acceptance:', !!getEquip.data && getEquip.data.success);
    } catch (e) {
      console.error('GET equipment by id failed after acceptance:', e.response?.data || e.message);
    }

    console.log('E2E test finished');
    process.exit(0);
  } catch (error) {
    console.error('E2E test error:', error.response?.data || error.message || error);
    process.exit(1);
  }
}

run();
