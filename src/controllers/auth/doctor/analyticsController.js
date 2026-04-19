import { Appointment, Doctor } from './shared.js';

export const getDoctorAnalytics = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id)
      .select('profileCtr totalEarningsInRupees withdrawnAmountInRupees bankAccount currentPlan')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const paidAppointments = await Appointment.find({
      doctorId: req.user?.id,
      paymentStatus: 'succeeded'
    })
      .populate('patientId', 'avatarDocument')
      .select(
        'patientId patientName amountInRupees doctorPayoutInRupees appointmentDate fromTime toTime consultationMode paidAt createdAt bookingStatus'
      )
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();

    const uniquePatientIds = new Set();
    let totalRevenueInRupees = 0;
    let monthlyRevenueInRupees = 0;
    const now = new Date();
    const currentUtcYear = now.getUTCFullYear();
    const currentUtcMonth = now.getUTCMonth();

    for (const appointment of paidAppointments) {
      uniquePatientIds.add(String(appointment?.patientId || ''));

      const doctorPayoutInRupees = Math.max(0, Math.trunc(Number(appointment?.doctorPayoutInRupees || 0)));
      totalRevenueInRupees += doctorPayoutInRupees;

      const paymentDate = appointment?.paidAt || appointment?.createdAt;
      const parsedPaymentDate = paymentDate ? new Date(paymentDate) : null;

      if (
        parsedPaymentDate
        && !Number.isNaN(parsedPaymentDate.getTime())
        && parsedPaymentDate.getUTCFullYear() === currentUtcYear
        && parsedPaymentDate.getUTCMonth() === currentUtcMonth
      ) {
        monthlyRevenueInRupees += doctorPayoutInRupees;
      }
    }

    // Keep totalEarningsInRupees in sync
    await Doctor.findByIdAndUpdate(req.user?.id, { $set: { totalEarningsInRupees: totalRevenueInRupees } });

    const recentAppointments = paidAppointments.slice(0, 8).map((appointment) => {
      return {
        id: String(appointment?._id || ''),
        patientName: String(appointment?.patientName || '').trim() || 'Patient',
        patientAvatarUrl: appointment.patientId?.avatarDocument?.url || '',
        appointmentDate: String(appointment?.appointmentDate || '').trim(),
        fromTime: String(appointment?.fromTime || '').trim(),
        toTime: String(appointment?.toTime || '').trim(),
        consultationMode: String(appointment?.consultationMode || '').trim() || 'online',
        priceInRupees: Math.max(0, Math.trunc(Number(appointment?.amountInRupees || 0))),
        earningInRupees: Math.max(0, Math.trunc(Number(appointment?.doctorPayoutInRupees || 0)))
      };
    });

    const withdrawnAmountInRupees = Math.max(0, Number(doctor.withdrawnAmountInRupees || 0));
    const availableBalanceInRupees = Math.max(0, totalRevenueInRupees - withdrawnAmountInRupees);
    
    const hasBankAccount = !!(doctor.bankAccount && doctor.bankAccount.accountNumber && doctor.bankAccount.accountTitle && doctor.bankAccount.bankName);

    return res.status(200).json({
      analytics: {
        profileCtr: Math.max(0, Math.trunc(Number(doctor.profileCtr || 0))),
        totalPatients: uniquePatientIds.size,
        totalAppointments: paidAppointments.length,
        totalRevenueInRupees,
        monthlyRevenueInRupees,
        withdrawnAmountInRupees,
        availableBalanceInRupees,
        hasBankAccount,
        bankAccount: doctor.bankAccount || null,
        currentPlan: doctor.currentPlan || 'platinum',
        recentAppointments
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctor analytics', error: error.message });
  }
};
