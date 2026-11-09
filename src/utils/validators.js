import validator from 'validator';

/**
 * Validate registration input
 */
export const validateRegistration = ({ fullName, email, password, phoneNumber }) => {
  const errors = [];

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
    errors.push('Full name is required.');
  } else if (fullName.trim().length < 2) {
    errors.push('Full name must be at least 2 characters long.');
  }

  if (!email || !validator.isEmail(email)) {
    errors.push('A valid email address is required.');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('Password must be at least 6 characters long.');
  }

  if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim().length > 0) {
    const cleanPhone = phoneNumber.replace(/[\s\-\+\(\)]/g, '');
    if (!/^\d{7,15}$/.test(cleanPhone)) {
      errors.push('Please enter a valid phone number (7 to 15 digits).');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate login input
 */
export const validateLogin = ({ email, password }) => {
  const errors = [];

  if (!email || !validator.isEmail(email)) {
    errors.push('A valid email address is required.');
  }

  if (!password || typeof password !== 'string' || password.trim().length === 0) {
    errors.push('Password is required.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate address input
 */
export const validateAddress = ({ fullName, phoneNumber, addressLine1, city, state, postalCode }) => {
  const errors = [];

  if (!fullName || fullName.trim().length === 0) {
    errors.push('Recipient full name is required.');
  }

  if (!phoneNumber || phoneNumber.trim().length === 0) {
    errors.push('Delivery phone number is required.');
  }

  if (!addressLine1 || addressLine1.trim().length === 0) {
    errors.push('Address line 1 is required.');
  }

  if (!city || city.trim().length === 0) {
    errors.push('City is required.');
  }

  if (!state || state.trim().length === 0) {
    errors.push('State / Province is required.');
  }

  if (!postalCode || postalCode.trim().length === 0) {
    errors.push('Postal code / PIN code is required.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export default {
  validateRegistration,
  validateLogin,
  validateAddress,
};
