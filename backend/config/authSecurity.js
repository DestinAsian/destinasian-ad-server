const MINIMUM_JWT_SECRET_LENGTH = 32;

const getRequiredJwtSecret = () => {
  const secret = String(process.env.JWT_SECRET || '').trim();
  const looksLikePlaceholder = /your-secret|change.*production|secret-key|replace-with/i.test(secret);

  if (secret.length < MINIMUM_JWT_SECRET_LENGTH || looksLikePlaceholder) {
    throw new Error(
      `JWT_SECRET must be configured with at least ${MINIMUM_JWT_SECRET_LENGTH} non-placeholder characters.`
    );
  }

  return secret;
};

module.exports = {
  JWT_SECRET: getRequiredJwtSecret(),
  MINIMUM_JWT_SECRET_LENGTH
};
