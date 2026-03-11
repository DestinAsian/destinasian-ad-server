import React from 'react';
import { useAuth } from '../contexts/AuthContext';

function AccountSelector() {
  const { currentAccount, accounts, selectAccount } = useAuth();

  const handleSelectAccount = async (accountId) => {
    await selectAccount(accountId);
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
