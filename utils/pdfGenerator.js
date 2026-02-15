const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// Générer un PDF pour un devis
exports.generateQuotePDF = async (quote, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(outputPath);
      
      doc.pipe(stream);
      
      // En-tête
      doc.fontSize(20).text('DEVIS', { align: 'center' });
      doc.moveDown();
      
      // Informations du devis
      doc.fontSize(12);
      doc.text(`Numéro de devis: ${quote.numero}`, { continued: false });
      doc.text(`Date: ${new Date(quote.dateDemande).toLocaleDateString('fr-FR')}`);
      if (quote.numeroCommande) {
        doc.text(`Numéro de commande: ${quote.numeroCommande}`);
      }
      doc.moveDown();
      
      // Informations client/demandeur
      doc.fontSize(14).text('Demandeur:', { underline: true });
      doc.fontSize(11);
      if (quote.demandeur) {
        doc.text(`${quote.demandeur.nomComplet || quote.demandeur.entreprise}`);
        if (quote.demandeur.email) doc.text(`Email: ${quote.demandeur.email}`);
        if (quote.demandeur.telephone) doc.text(`Téléphone: ${quote.demandeur.telephone}`);
      }
      doc.moveDown();
      
      // Informations destinataire
      if (quote.destinataire) {
        doc.fontSize(14).text('Destinataire:', { underline: true });
        doc.fontSize(11);
        doc.text(`${quote.destinataire.nomComplet || quote.destinataire.entreprise}`);
        if (quote.destinataire.email) doc.text(`Email: ${quote.destinataire.email}`);
        if (quote.destinataire.telephone) doc.text(`Téléphone: ${quote.destinataire.telephone}`);
        doc.moveDown();
      }
      
      // Détails du devis
      doc.fontSize(14).text('Détails du devis:', { underline: true });
      doc.fontSize(11);
      doc.text(`Objet: ${quote.objet}`);
      doc.text(`Type de travaux: ${quote.typeTravaux}`);
      doc.text(`Urgence: ${quote.urgence}`);
      doc.text(`Statut: ${quote.statut}`);
      if (quote.montantHT) {
        doc.text(`Montant HT: ${quote.montantHT} ${quote.devise}`);
        doc.text(`Montant TVA (20%): ${(quote.montantHT * 0.20).toFixed(2)} ${quote.devise}`);
        doc.text(`Montant TTC: ${(quote.montantHT * 1.20).toFixed(2)} ${quote.devise}`, { bold: true });
      }
      doc.moveDown();
      
      // Description
      doc.fontSize(14).text('Description:', { underline: true });
      doc.fontSize(10);
      doc.text(quote.description, { align: 'justify' });
      doc.moveDown();
      
      // Dates importantes
      if (quote.dateReponseAttendue || quote.datePrevisionnelleTravaux) {
        doc.fontSize(14).text('Dates:', { underline: true });
        doc.fontSize(11);
        if (quote.dateReponseAttendue) {
          doc.text(`Date de réponse attendue: ${new Date(quote.dateReponseAttendue).toLocaleDateString('fr-FR')}`);
        }
        if (quote.datePrevisionnelleTravaux) {
          doc.text(`Date prévisionnelle des travaux: ${new Date(quote.datePrevisionnelleTravaux).toLocaleDateString('fr-FR')}`);
        }
        doc.moveDown();
      }
      
      // Réponse si disponible
      if (quote.reponse && quote.reponse.description) {
        doc.fontSize(14).text('Réponse:', { underline: true });
        doc.fontSize(10);
        doc.text(quote.reponse.description);
        if (quote.reponse.conditions) {
          doc.text(`Conditions: ${quote.reponse.conditions}`);
        }
      }
      
      // Pied de page
      doc.fontSize(8).text(
        `Généré le ${new Date().toLocaleString('fr-FR')}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );
      
      doc.end();
      
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};

// Générer un fichier Excel pour un devis
exports.generateQuoteExcel = async (quote, outputPath) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Devis');
    
    // Configuration des colonnes
    worksheet.columns = [
      { header: 'Champ', key: 'field', width: 30 },
      { header: 'Valeur', key: 'value', width: 50 }
    ];
    
    // Style pour les en-têtes
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Ajouter les données
    const rows = [
      { field: 'Numéro de devis', value: quote.numero },
      { field: 'Date de demande', value: new Date(quote.dateDemande).toLocaleDateString('fr-FR') },
      { field: 'Objet', value: quote.objet },
      { field: 'Description', value: quote.description },
      { field: 'Type de travaux', value: quote.typeTravaux },
      { field: 'Urgence', value: quote.urgence },
      { field: 'Statut', value: quote.statut },
      { field: 'Montant HT', value: quote.montantHT ? `${quote.montantHT} ${quote.devise}` : 'N/A' },
      { field: 'Montant TVA (20%)', value: quote.montantHT ? `${(quote.montantHT * 0.20).toFixed(2)} ${quote.devise}` : 'N/A' },
      { field: 'Montant TTC', value: quote.montantHT ? `${(quote.montantHT * 1.20).toFixed(2)} ${quote.devise}` : 'N/A' }
    ];
    
    if (quote.numeroCommande) {
      rows.push({ field: 'Numéro de commande', value: quote.numeroCommande });
    }
    
    if (quote.dateReponseAttendue) {
      rows.push({ field: 'Date de réponse attendue', value: new Date(quote.dateReponseAttendue).toLocaleDateString('fr-FR') });
    }
    
    if (quote.datePrevisionnelleTravaux) {
      rows.push({ field: 'Date prévisionnelle des travaux', value: new Date(quote.datePrevisionnelleTravaux).toLocaleDateString('fr-FR') });
    }
    
    if (quote.demandeur) {
      rows.push({ field: 'Demandeur', value: quote.demandeur.nomComplet || quote.demandeur.entreprise });
      if (quote.demandeur.email) {
        rows.push({ field: 'Email demandeur', value: quote.demandeur.email });
      }
      if (quote.demandeur.telephone) {
        rows.push({ field: 'Téléphone demandeur', value: quote.demandeur.telephone });
      }
    }
    
    if (quote.destinataire) {
      rows.push({ field: 'Destinataire', value: quote.destinataire.nomComplet || quote.destinataire.entreprise });
    }
    
    if (quote.reponse && quote.reponse.description) {
      rows.push({ field: 'Réponse', value: quote.reponse.description });
      if (quote.reponse.conditions) {
        rows.push({ field: 'Conditions', value: quote.reponse.conditions });
      }
    }
    
    worksheet.addRows(rows);
    
    // Auto-ajuster la hauteur des lignes
    worksheet.eachRow((row) => {
      row.height = 20;
    });
    
    // Sauvegarder le fichier
    await workbook.xlsx.writeFile(outputPath);
    
    return outputPath;
  } catch (error) {
    throw error;
  }
};

// Générer un rapport d'intervention en PDF
exports.generateInterventionPDF = async (intervention, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(outputPath);
      
      doc.pipe(stream);
      
      // En-tête
      doc.fontSize(20).text('RAPPORT D\'INTERVENTION', { align: 'center' });
      doc.moveDown();
      
      // Informations de base
      doc.fontSize(12);
      doc.text(`Numéro: ${intervention.numero}`);
      doc.text(`Type: ${intervention.type}`);
      doc.text(`Titre: ${intervention.titre}`);
      doc.text(`Statut: ${intervention.statut}`);
      doc.text(`Priorité: ${intervention.priorite}`);
      doc.moveDown();
      
      // Dates
      doc.fontSize(14).text('Dates:', { underline: true });
      doc.fontSize(11);
      doc.text(`Date prévue: ${new Date(intervention.datePrevu).toLocaleString('fr-FR')}`);
      if (intervention.dateDebut) {
        doc.text(`Date de début: ${new Date(intervention.dateDebut).toLocaleString('fr-FR')}`);
      }
      if (intervention.dateFin) {
        doc.text(`Date de fin: ${new Date(intervention.dateFin).toLocaleString('fr-FR')}`);
      }
      if (intervention.dureeEstimee) {
        doc.text(`Durée estimée: ${intervention.dureeEstimee}h`);
      }
      if (intervention.dureeReelle) {
        doc.text(`Durée réelle: ${intervention.dureeReelle}h`);
      }
      doc.moveDown();
      
      // Description
      doc.fontSize(14).text('Description:', { underline: true });
      doc.fontSize(10);
      doc.text(intervention.description, { align: 'justify' });
      doc.moveDown();
      
      // Travaux effectués
      if (intervention.travauxEffectues && intervention.travauxEffectues.description) {
        doc.fontSize(14).text('Travaux effectués:', { underline: true });
        doc.fontSize(10);
        doc.text(intervention.travauxEffectues.description);
        doc.moveDown();
      }
      
      // Résultat
      if (intervention.resultat && intervention.resultat.description) {
        doc.fontSize(14).text('Résultat:', { underline: true });
        doc.fontSize(10);
        doc.text(intervention.resultat.description);
        if (intervention.resultat.recommandations) {
          doc.text(`Recommandations: ${intervention.resultat.recommandations}`);
        }
        doc.moveDown();
      }
      
      // Coûts
      if (intervention.couts && intervention.couts.total > 0) {
        doc.fontSize(14).text('Coûts:', { underline: true });
        doc.fontSize(11);
        doc.text(`Main d'œuvre: ${intervention.couts.mainOeuvre || 0} €`);
        doc.text(`Pièces: ${intervention.couts.pieces || 0} €`);
        doc.text(`Déplacement: ${intervention.couts.deplacement || 0} €`);
        doc.fontSize(12).text(`Total: ${intervention.couts.total} €`, { bold: true });
        doc.moveDown();
      }
      
      // Pied de page
      doc.fontSize(8).text(
        `Rapport généré le ${new Date().toLocaleString('fr-FR')}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );
      
      doc.end();
      
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};
