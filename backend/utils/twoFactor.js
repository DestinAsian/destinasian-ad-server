const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const TWO_FACTOR_ISSUER = process.env.TWO_FACTOR_ISSUER || 'DestinAsian Ad Server';
const TOTP_WINDOW = Number(process.env.TWO_FACTOR_WINDOW || 1);

const normalizeTotpToken = (token) => {
  if (typeof token !== 'string' && typeof token !== 'number') {
    return null;
  }

  const digits = String(token).trim();
  if (!/^\d{6}$/.test(digits)) {
    return null;
  }

  return digits;
};

const generateTwoFactorSecret = ({ email }) => {
  const secret = speakeasy.generateSecret({
    name: `${TWO_FACTOR_ISSUER}:${email}`,
    issuer: TWO_FACTOR_ISSUER,
    length: 20
  });

  return secret;
};

const verifyTotpToken = ({ secret, token }) => {
  const normalizedToken = normalizeTotpToken(token);
  if (!normalizedToken || !secret) {
    return false;
  }

  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: normalizedToken,
    window: TOTP_WINDOW,
    digits: 6,
    step: 30
  });
};

const buildQrCodeDataUrl = async ({ otpauthUrl }) => {
  return qrcode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240
  });
};

module.exports = {
  generateTwoFactorSecret,
  verifyTotpToken,
  buildQrCodeDataUrl,
  normalizeTotpToken,
  TWO_FACTOR_ISSUER
};
