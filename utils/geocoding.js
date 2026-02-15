const axios = require('axios');

/**
 * Service de géocodage utilisant Nominatim (OpenStreetMap)
 * Convertit une adresse en coordonnées GPS (latitude, longitude)
 * GRATUIT et sans clé API !
 */

/**
 * Géocoder une adresse en coordonnées GPS avec Nominatim
 * @param {string} address - Adresse complète à géocoder
 * @returns {Promise<{latitude: number, longitude: number, formattedAddress: string}>}
 */
async function geocodeAddress(address) {
  if (!address || address.trim() === '') {
    throw new Error('Adresse vide');
  }

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: address,
        format: 'json',
        limit: 1,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'QR-Solution-App/1.0' // Nominatim requiert un User-Agent
      }
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        formattedAddress: result.display_name,
        placeId: result.place_id
      };
    } else {
      throw new Error('Aucun résultat trouvé pour cette adresse');
    }
  } catch (error) {
    if (error.response) {
      throw new Error(`Erreur API Nominatim: ${error.response.statusText}`);
    }
    throw error;
  }
}

/**
 * Géocodage inversé : convertir des coordonnées en adresse avec Nominatim
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {Promise<string>} - Adresse formatée
 */
async function reverseGeocode(latitude, longitude) {
  if (!latitude || !longitude) {
    throw new Error('Coordonnées invalides');
  }

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat: latitude,
        lon: longitude,
        format: 'json'
      },
      headers: {
        'User-Agent': 'QR-Solution-App/1.0'
      }
    });

    if (response.data && response.data.display_name) {
      return response.data.display_name;
    } else {
      throw new Error('Aucune adresse trouvée pour ces coordonnées');
    }
  } catch (error) {
    if (error.response) {
      throw new Error(`Erreur API Nominatim: ${error.response.statusText}`);
    }
    throw error;
  }
}

/**
 * Valider des coordonnées GPS
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {boolean}
 */
function validateCoordinates(latitude, longitude) {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

module.exports = {
  geocodeAddress,
  reverseGeocode,
  validateCoordinates
};
