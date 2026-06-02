import { Clinic } from '../../../models/Clinic.js';
import WithdrawRequest from '../../../models/WithdrawRequest.js';

export const saveClinicBankAccount = async (req, res) => {
  try {
    const { accountTitle, accountNumber, bankName } = req.body;

    if (!accountTitle || !accountNumber || !bankName) {
      return res.status(400).json({ message: 'All bank account fields are required' });
    }

    const clinic = await Clinic.findByIdAndUpdate(
      req.user.id,
      { $set: { 'bankAccount.accountTitle': accountTitle, 'bankAccount.accountNumber': accountNumber, 'bankAccount.bankName': bankName } },
      { new: true }
    ).select('bankAccount');

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    return res.json({ bankAccount: clinic.bankAccount, message: 'Bank account saved successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const getClinicBankAccount = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user.id).select('bankAccount totalEarningsInRupees withdrawnAmountInRupees').lean();

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    return res.json({
      bankAccount: clinic.bankAccount || {},
      totalEarningsInRupees: clinic.totalEarningsInRupees || 0,
      withdrawnAmountInRupees: clinic.withdrawnAmountInRupees || 0,
      availableBalanceInRupees: Math.max(0, (clinic.totalEarningsInRupees || 0) - (clinic.withdrawnAmountInRupees || 0))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const createWithdrawRequest = async (req, res) => {
  try {
    const clinicId = String(req.user.id || '').trim();
    const amountInRupees = Math.trunc(Number(req.body.amountInRupees || 0));

    if (amountInRupees < 5000) {
      return res.status(400).json({ message: 'Minimum withdrawal amount is PKR 5,000' });
    }

    const clinic = await Clinic.findById(clinicId)
      .select('bankAccount totalEarningsInRupees withdrawnAmountInRupees')
      .lean();

    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });

    const available = Math.max(0, (clinic.totalEarningsInRupees || 0) - (clinic.withdrawnAmountInRupees || 0));

    if (amountInRupees > available) {
      return res.status(400).json({ message: `Insufficient balance. Available: PKR ${available.toLocaleString('en-PK')}` });
    }

    if (!clinic.bankAccount?.accountNumber) {
      return res.status(400).json({ message: 'Please add a bank account first in your profile settings' });
    }

    const existingPending = await WithdrawRequest.findOne({ clinicId, status: 'pending' });
    if (existingPending) {
      return res.status(400).json({ message: 'You already have a pending withdrawal request' });
    }

    // Admin takes 10% commission. The requested amount is the net amount for the clinic. 
    // Wait! The commission for appointment booking is usually deducted BEFORE it's added to totalEarningsInRupees.
    // "and clinic and admin will get his comission which is 10%" 
    // Does this mean 10% of the withdrawal amount goes to admin, or 10% is deducted from earnings at payment?
    // Let's check how Doctor appointments handle the 10% commission.
    const withdrawRequest = await WithdrawRequest.create({
      clinicId,
      amountInRupees,
      bankAccountTitle: clinic.bankAccount.accountTitle,
      bankAccountNumber: clinic.bankAccount.accountNumber,
      bankName: clinic.bankAccount.bankName
    });

    return res.status(201).json({ withdrawRequest, message: 'Withdrawal request submitted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not create withdrawal request', error: error.message });
  }
};

export const getClinicWithdrawRequests = async (req, res) => {
  try {
    const clinicId = String(req.user.id || '').trim();
    const requests = await WithdrawRequest.find({ clinicId }).sort({ createdAt: -1 }).lean();
    return res.json({ requests });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch withdraw requests', error: error.message });
  }
};
