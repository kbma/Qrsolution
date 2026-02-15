const nodemailer = require('nodemailer');

// Configuration du transporteur d'email
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false, // true pour 465, false pour les autres ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Fonction pour envoyer un email
exports.sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'QR Solution'} <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email envoyé:', info.messageId);
    return info;
  } catch (error) {
    console.error('Erreur envoi email:', error);
    throw error;
  }
};

// Fonction pour envoyer une notification de nouveau devis
exports.sendQuoteNotification = async (quote, destinataire) => {
  return await exports.sendEmail({
    to: destinataire.email,
    subject: `Nouvelle demande de devis - ${quote.numero}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Nouvelle demande de devis</h2>
        <p>Vous avez reçu une nouvelle demande de devis.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Numéro de devis:</strong> ${quote.numero}</p>
          <p><strong>Objet:</strong> ${quote.objet}</p>
          <p><strong>Type de travaux:</strong> ${quote.typeTravaux}</p>
          <p><strong>Urgence:</strong> ${quote.urgence}</p>
          <p><strong>Date de demande:</strong> ${new Date(quote.dateDemande).toLocaleDateString('fr-FR')}</p>
          ${quote.dateReponseAttendue ? `<p><strong>Date de réponse attendue:</strong> ${new Date(quote.dateReponseAttendue).toLocaleDateString('fr-FR')}</p>` : ''}
        </div>
        
        <p><strong>Description:</strong></p>
        <p>${quote.description}</p>
        
        <p style="margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}/quotes/${quote._id}" 
             style="background-color: #007bff; color: white; padding: 10px 20px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Consulter le devis
          </a>
        </p>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Cet email a été envoyé automatiquement par QR Solution. Merci de ne pas y répondre.
        </p>
      </div>
    `
  });
};

// Fonction pour envoyer une notification de consultation de devis
exports.sendQuoteConsultationNotification = async (quote, consultePar, proprietaire) => {
  return await exports.sendEmail({
    to: proprietaire.email,
    subject: `Devis ${quote.numero} consulté`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Votre devis a été consulté</h2>
        <p>Le devis <strong>${quote.numero}</strong> a été consulté.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Consulté par:</strong> ${consultePar.nomComplet || consultePar.entreprise}</p>
          <p><strong>Date de consultation:</strong> ${new Date().toLocaleString('fr-FR')}</p>
          <p><strong>Objet du devis:</strong> ${quote.objet}</p>
        </div>
        
        <p style="margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}/quotes/${quote._id}" 
             style="background-color: #007bff; color: white; padding: 10px 20px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Voir le devis
          </a>
        </p>
      </div>
    `
  });
};

// Fonction pour envoyer une notification d'intervention
exports.sendInterventionNotification = async (intervention, destinataire, type = 'created') => {
  const subjects = {
    created: `Nouvelle intervention planifiée - ${intervention.numero}`,
    started: `Intervention démarrée - ${intervention.numero}`,
    completed: `Intervention terminée - ${intervention.numero}`,
    cancelled: `Intervention annulée - ${intervention.numero}`
  };
  
  const titles = {
    created: 'Nouvelle intervention planifiée',
    started: 'Intervention démarrée',
    completed: 'Intervention terminée',
    cancelled: 'Intervention annulée'
  };
  
  return await exports.sendEmail({
    to: destinataire.email,
    subject: subjects[type],
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${titles[type]}</h2>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Numéro:</strong> ${intervention.numero}</p>
          <p><strong>Titre:</strong> ${intervention.titre}</p>
          <p><strong>Type:</strong> ${intervention.type}</p>
          <p><strong>Priorité:</strong> ${intervention.priorite}</p>
          <p><strong>Date prévue:</strong> ${new Date(intervention.datePrevu).toLocaleString('fr-FR')}</p>
          ${intervention.dureeEstimee ? `<p><strong>Durée estimée:</strong> ${intervention.dureeEstimee}h</p>` : ''}
        </div>
        
        <p><strong>Description:</strong></p>
        <p>${intervention.description}</p>
        
        <p style="margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL}/interventions/${intervention._id}" 
             style="background-color: #007bff; color: white; padding: 10px 20px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Voir l'intervention
          </a>
        </p>
      </div>
    `
  });
};
