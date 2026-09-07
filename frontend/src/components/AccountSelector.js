import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

function AccountSelector() {
  const { currentAccount, accounts, selectAccount } = useAuth();
  const { notifyError, notifySuccess } = useToast();
  const [switchingAccount, setSwitchingAccount] = useState(false);

  const handleSelectAccount = async (accountId) => {
    if (!accountId || accountId === currentAccount?.id || switchingAccount) return;

    setSwitchingAccount(true);
    const selectedAccount = accounts.find((account) => account.id === accountId);
    try {
      const result = await selectAccount(accountId);
      if (result?.success) {
        notifySuccess(`Switched to ${selectedAccount?.name || 'the selected account'}.`);
      } else {
        notifyError(result?.error || 'Failed to switch account.');
      }
    } catch (error) {
      notifyError(error?.message || 'Failed to switch account.');
    } finally {
      setSwitchingAccount(false);
    }
  };

  if (!currentAccount) {
    return null;
  }

  return (
    <div className="account-selector">
      <div className="account-header">
        <span className="account-label">Account:</span>
        <div className="account-dropdown">
          <select
            value={currentAccount.id}
            onChange={(e) => handleSelectAccount(e.target.value)}
            className="account-select"
            disabled={switchingAccount}
            aria-busy={switchingAccount}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default AccountSelector;
