import { MedicalStore } from '../../../models/MedicalStore.js';
import WithdrawRequest from '../../../models/WithdrawRequest.js';

export const saveStoreBankAccount = async (req, res) => {
  try {
    const storeId = String(req.user.id || '').trim();
    const accountTitle = String(req.body.accountTitle || '').trim();
    const accountNumber = String(req.body.accountNumber || '').trim();
    const bankName = String(req.body.bankName || '').trim();

    if (!accountTitle || !accountNumber || !bankName) {
      return res.status(400).json({ message: 'Account title, account number, and bank name are required' });
    }

    const store = await MedicalStore.findByIdAndUpdate(
      storeId,
      { $set: { 'bankAccount.accountTitle': accountTitle, 'bankAccount.accountNumber': accountNumber, 'bankAccount.bankName': bankName } },
      { new: true }
    ).select('bankAccount');

    if (!store) return res.status(404).json({ message: 'Store not found' });

    return res.json({ bankAccount: store.bankAccount, message: 'Bank account saved successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not save bank account' });
  }
};

export const getStoreBankAccount = async (req, res) => {
  try {
    const store = await MedicalStore.findById(req.user.id).select('bankAccount totalEarningsInRupees withdrawnAmountInRupees').lean();
    if (!store) return res.status(404).json({ message: 'Store not found' });

    return res.json({
      bankAccount: store.bankAccount || {},
      totalEarningsInRupees: store.totalEarningsInRupees || 0,
      withdrawnAmountInRupees: store.withdrawnAmountInRupees || 0,
      availableBalanceInRupees: Math.max(0, (store.totalEarningsInRupees || 0) - (store.withdrawnAmountInRupees || 0))
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch bank account' });
  }
};

export const createStoreWithdrawRequest = async (req, res) => {
  try {
    const storeId = String(req.user.id || '').trim();
    const amountInRupees = Math.trunc(Number(req.body.amountInRupees || 0));

    if (amountInRupees < 5000) {
      return res.status(400).json({ message: 'Minimum withdrawal amount is PKR 5,000' });
    }

    const store = await MedicalStore.findById(storeId)
      .select('bankAccount totalEarningsInRupees withdrawnAmountInRupees')
      .lean();

    if (!store) return res.status(404).json({ message: 'Store not found' });

    const available = Math.max(0, (store.totalEarningsInRupees || 0) - (store.withdrawnAmountInRupees || 0));

    if (amountInRupees > available) {
      return res.status(400).json({ message: `Insufficient balance. Available: PKR ${available.toLocaleString('en-PK')}` });
    }

    if (!store.bankAccount?.accountNumber) {
      return res.status(400).json({ message: 'Please add a bank account first in your profile settings' });
    }

    // Check no pending request already
    const existingPending = await WithdrawRequest.findOne({ storeId, status: 'pending' });
    if (existingPending) {
      return res.status(400).json({ message: 'You already have a pending withdrawal request' });
    }

    const withdrawRequest = await WithdrawRequest.create({
      storeId,
      amountInRupees,
      bankAccountTitle: store.bankAccount.accountTitle,
      bankAccountNumber: store.bankAccount.accountNumber,
      bankName: store.bankAccount.bankName
    });

    return res.status(201).json({ withdrawRequest, message: 'Withdrawal request submitted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not create withdrawal request' });
  }
};

export const getStoreWithdrawRequests = async (req, res) => {
  try {
    const storeId = String(req.user.id || '').trim();
    const requests = await WithdrawRequest.find({ storeId }).sort({ createdAt: -1 }).lean();
    return res.json({ requests });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch withdraw requests' });
  }
};
