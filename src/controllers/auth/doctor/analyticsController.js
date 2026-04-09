import { Appointment, Doctor } from './shared.js';

export const getDoctorAnalytics = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id)
      .select('profileCtr')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const paidAppointments = await Appointment.find({
      doctorId: req.user?.id,
      paymentStatus: 'succeeded'
    })
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

    const recentAppointments = paidAppointments.slice(0, 8).map((appointment) => {
      return {
        id: String(appointment?._id || ''),
        patientName: String(appointment?.patientName || '').trim() || 'Patient',
        appointmentDate: String(appointment?.appointmentDate || '').trim(),
        fromTime: String(appointment?.fromTime || '').trim(),
        toTime: String(appointment?.toTime || '').trim(),
        consultationMode: String(appointment?.consultationMode || '').trim() || 'online',
        priceInRupees: Math.max(0, Math.trunc(Number(appointment?.amountInRupees || 0))),
        earningInRupees: Math.max(0, Math.trunc(Number(appointment?.doctorPayoutInRupees || 0)))
      };
    });

    return res.status(200).json({
      analytics: {
        profileCtr: Math.max(0, Math.trunc(Number(doctor.profileCtr || 0))),
        totalPatients: uniquePatientIds.size,
        totalAppointments: paidAppointments.length,
        totalRevenueInRupees,
        monthlyRevenueInRupees,
        recentAppointments
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctor analytics', error: error.message });
  }
};
