import WithdrawRequest from '../../../models/WithdrawRequest.js';
import { Doctor } from '../../auth/doctor/shared.js';
import { MedicalStore } from '../../../models/MedicalStore.js';
import { sendWithdrawApprovedEmail, sendWithdrawRejectedEmail } from '../../../services/mailService.js';

export const getAdminWithdrawRequests = async (req, res) => {
  try {
    const requests = await WithdrawRequest.find()
      .populate('doctorId', 'fullName email avatarDocument totalEarningsInRupees withdrawnAmountInRupees')
      .populate('storeId', 'name email avatarDocument totalEarningsInRupees withdrawnAmountInRupees')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ requests });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not fetch withdraw requests' });
  }
};

export const reviewWithdrawRequest = async (req, res) => {
  try {
    const requestId = String(req.params.requestId || '').trim();
    const action = String(req.body.action || '').trim(); // 'approve' | 'reject'
    const rejectionReason = String(req.body.rejectionReason || '').trim();

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be approve or reject' });
    }

    const withdrawRequest = await WithdrawRequest.findById(requestId);
    if (!withdrawRequest) return res.status(404).json({ message: 'Withdraw request not found' });
    if (withdrawRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Request has already been reviewed' });
    }

    let user = null;
    let userName = '';
    let userRole = 'doctor';

    if (withdrawRequest.doctorId) {
      user = await Doctor.findById(withdrawRequest.doctorId).select('fullName email totalEarningsInRupees withdrawnAmountInRupees');
      if (user) userName = user.fullName;
    } else if (withdrawRequest.storeId) {
      user = await MedicalStore.findById(withdrawRequest.storeId).select('name email totalEarningsInRupees withdrawnAmountInRupees');
      if (user) {
        userName = user.name;
        userRole = 'store';
      }
    }

    if (!user) return res.status(404).json({ message: 'User not found for this withdraw request' });

    if (action === 'approve') {
      withdrawRequest.status = 'approved';
      withdrawRequest.reviewedAt = new Date();

      user.withdrawnAmountInRupees = Math.min(
        user.totalEarningsInRupees,
        (user.withdrawnAmountInRupees || 0) + withdrawRequest.amountInRupees
      );
      await user.save();

      sendWithdrawApprovedEmail({
        to: user.email,
        userName,
        userRole,
        amountInRupees: withdrawRequest.amountInRupees,
        bankName: withdrawRequest.bankName,
        accountNumber: withdrawRequest.bankAccountNumber
      }).catch(err => console.error('Withdraw email error:', err));

    } else {
      withdrawRequest.status = 'rejected';
      withdrawRequest.reviewedAt = new Date();
      withdrawRequest.rejectionReason = rejectionReason;

      sendWithdrawRejectedEmail({
        to: user.email,
        userName,
        userRole,
        amountInRupees: withdrawRequest.amountInRupees,
        rejectionReason
      }).catch(err => console.error('Withdraw rejection email error:', err));
    }

    await withdrawRequest.save();

    return res.json({ message: `Withdraw request ${action}d successfully`, withdrawRequest });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not review withdraw request' });
  }
};
