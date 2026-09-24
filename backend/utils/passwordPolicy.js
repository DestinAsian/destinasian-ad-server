const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MAX_PASSWORD_BYTES = 72;

const validatePassword = (password) => {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return {
      valid: false,
      message: `Password must be no more than ${MAX_PASSWORD_LENGTH} characters and ${MAX_PASSWORD_BYTES} UTF-8 bytes`
    };
  }

  return { valid: true, message: null };
};

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
  validatePassword
};
