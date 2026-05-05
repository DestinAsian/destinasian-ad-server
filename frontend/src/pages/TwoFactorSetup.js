import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Auth.css';

function TwoFactorSetup() {
  const { user, startTwoFactorSetup, verifyTwoFactorSetup, logout } = useAuth();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [manualEntryKey, setManualEntryKey] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const hasInitializedSetup = useRef(false);

  useEffect(() => {
    if (hasInitializedSetup.current) {
      return;
    }
    hasInitializedSetup.current = true;

    const loadSetup = async () => {
      setLoadingSetup(true);
      setError('');
      const result = await startTwoFactorSetup();
      if (result.success) {
        setQrCodeDataUrl(result.data.qrCodeDataUrl || '');
        setManualEntryKey(result.data.manualEntryKey || '');
      } else {
        setError(result.error);
      }
      setLoadingSetup(false);
    };

    loadSetup();
  }, [startTwoFactorSetup]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const result = await verifyTwoFactorSetup(token);
    if (result.success) {
      setSuccess('Two-factor authentication enabled successfully.');
      setToken('');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: '520px' }}>
        <h2>Set Up Two-Factor Authentication</h2>
        <p className="info-message">
          Owner account protection is required. Scan this QR code in Google Authenticator and enter a 6-digit code.
        </p>
        <p className="info-message">Signed in as: <strong>{user?.email}</strong></p>
        {error && <div className="error-message">{error}</div>}
        {success && <div className="info-message">{success}</div>}

        {loadingSetup ? (
          <div>Loading 2FA setup...</div>
        ) : (
          <>
            {qrCodeDataUrl && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                <img src={qrCodeDataUrl} alt="2FA QR Code" style={{ width: 220, height: 220, borderRadius: 8 }} />
              </div>
            )}
            <div className="token-box">
              <div className="token-label">Manual Entry Key</div>
              <div className="token-value">{manualEntryKey || '-'}</div>
            </div>

            <form onSubmit={handleVerify}>
              <div className="form-group">
                <label>Authenticator Code:</label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  disabled={loading}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Verifying...' : 'Enable 2FA'}
              </button>
            </form>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '10px' }}
              onClick={logout}
            >
              Logout
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default TwoFactorSetup;
