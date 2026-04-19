import { Doctor } from './shared.js';
import WithdrawRequest from '../../../models/WithdrawRequest.js';

export const saveDoctorBankAccount = async (req, res) => {
  try {
    const doctorId = String(req.user.id || '').trim();
    const accountTitle = String(req.body.accountTitle || '').trim();
    const accountNumber = String(req.body.accountNumber || '').trim();
    const bankName = String(req.body.bankName || '').trim();

    if (!accountTitle || !accountNumber || !bankName) {
      return res.status(400).json({ message: 'Account title, account number, and bank name are required' });
    }

    const doctor = await Doctor.findByIdAndUpdate(
      doctorId,
      { $set: { 'bankAccount.accountTitle': accountTitle, 'bankAccount.accountNumber': accountNumber, 'bankAccount.bankName': bankName } },
      { new: true }
    ).select('bankAccount');

    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    return res.json({ bankAccount: doctor.bankAccount, message: 'Bank account saved successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not save bank account' });
  }
};

export const getDoctorBankAccount = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user.id).select('bankAccount totalEarningsInRupees withdrawnAmountInRupees').lean();
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    return res.json({
      bankAccount: doctor.bankAccount || {},
      totalEarningsInRupees: doctor.totalEarningsInRupees || 0,
      withdrawnAmountInRupees: doctor.withdrawnAmountInRupees || 0,
      availableBalanceInRupees: Math.max(0, (doctor.totalEarningsInRupees || 0) - (doctor.withdrawnAmountInRupees || 0))
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch bank account' });
  }
};

export const createWithdrawRequest = async (req, res) => {
  try {
    const doctorId = String(req.user.id || '').trim();
    const amountInRupees = Math.trunc(Number(req.body.amountInRupees || 0));

    if (amountInRupees < 5000) {
      return res.status(400).json({ message: 'Minimum withdrawal amount is PKR 5,000' });
    }

    const doctor = await Doctor.findById(doctorId)
      .select('bankAccount totalEarningsInRupees withdrawnAmountInRupees')
      .lean();

    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const available = Math.max(0, (doctor.totalEarningsInRupees || 0) - (doctor.withdrawnAmountInRupees || 0));

    if (amountInRupees > available) {
      return res.status(400).json({ message: `Insufficient balance. Available: PKR ${available.toLocaleString('en-PK')}` });
    }

    if (!doctor.bankAccount?.accountNumber) {
      return res.status(400).json({ message: 'Please add a bank account first in your profile settings' });
    }

    // Check no pending request already
    const existingPending = await WithdrawRequest.findOne({ doctorId, status: 'pending' });
    if (existingPending) {
      return res.status(400).json({ message: 'You already have a pending withdrawal request' });
    }

    const withdrawRequest = await WithdrawRequest.create({
      doctorId,
      amountInRupees,
      bankAccountTitle: doctor.bankAccount.accountTitle,
      bankAccountNumber: doctor.bankAccount.accountNumber,
      bankName: doctor.bankAccount.bankName
    });

    return res.status(201).json({ withdrawRequest, message: 'Withdrawal request submitted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not create withdrawal request' });
  }
};

export const getDoctorWithdrawRequests = async (req, res) => {
  try {
    const doctorId = String(req.user.id || '').trim();
    const requests = await WithdrawRequest.find({ doctorId }).sort({ createdAt: -1 }).lean();
    return res.json({ requests });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch withdraw requests' });
  }
};
