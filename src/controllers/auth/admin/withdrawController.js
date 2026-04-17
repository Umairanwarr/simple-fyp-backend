import WithdrawRequest from '../../../models/WithdrawRequest.js';
import { Doctor } from '../../auth/doctor/shared.js';
import { sendWithdrawApprovedEmail, sendWithdrawRejectedEmail } from '../../../services/mailService.js';

export const getAdminWithdrawRequests = async (req, res) => {
  try {
    const requests = await WithdrawRequest.find()
      .populate('doctorId', 'fullName email avatarDocument totalEarningsInRupees withdrawnAmountInRupees')
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

    const doctor = await Doctor.findById(withdrawRequest.doctorId)
      .select('fullName email totalEarningsInRupees withdrawnAmountInRupees');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    if (action === 'approve') {
      withdrawRequest.status = 'approved';
      withdrawRequest.reviewedAt = new Date();

      // Deduct from doctor's earnings
      doctor.withdrawnAmountInRupees = Math.min(
        doctor.totalEarningsInRupees,
        (doctor.withdrawnAmountInRupees || 0) + withdrawRequest.amountInRupees
      );
      await doctor.save();

      // Send approval email async
      sendWithdrawApprovedEmail({
        to: doctor.email,
        doctorName: doctor.fullName,
        amountInRupees: withdrawRequest.amountInRupees,
        bankName: withdrawRequest.bankName,
        accountNumber: withdrawRequest.bankAccountNumber
      }).catch(err => console.error('Withdraw email error:', err));

    } else {
      withdrawRequest.status = 'rejected';
      withdrawRequest.reviewedAt = new Date();
      withdrawRequest.rejectionReason = rejectionReason;

      sendWithdrawRejectedEmail({
        to: doctor.email,
        doctorName: doctor.fullName,
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
