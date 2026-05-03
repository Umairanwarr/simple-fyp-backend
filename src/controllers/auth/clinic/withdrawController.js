import { Clinic } from '../../../models/Clinic.js';

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
      withdrawnAmountInRupees: clinic.withdrawnAmountInRupees || 0
    });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
