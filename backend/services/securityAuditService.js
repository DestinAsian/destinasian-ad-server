const logSecurityEvent = (event, details = {}, level = 'info') => {
  const safeDetails = {
    event,
    timestamp: new Date().toISOString(),
    ...(details.userId ? { userId: String(details.userId) } : {}),
    ...(details.emailHash ? { emailHash: String(details.emailHash) } : {}),
    ...(details.reason ? { reason: String(details.reason) } : {})
  };

  const logger = level === 'warn' ? console.warn : console.info;
  logger(`[security-audit] ${JSON.stringify(safeDetails)}`);
};

module.exports = { logSecurityEvent };
