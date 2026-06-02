import { Clinic } from '../../../models/Clinic.js';
import { ClinicDoctor } from '../../../models/ClinicDoctor.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';
import { CampaignPromotion } from '../../../models/CampaignPromotion.js';

const DAY_WINDOW = 14;

const formatDateKey = (dateValue) => {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateFromKey = (rawDateKey) => {
  const safeKey = String(rawDateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeKey)) return null;
  const parsedDate = new Date(`${safeKey}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getHourFromTime = (timeValue) => {
  const [hours] = String(timeValue || '').split(':').map(Number);
  return Number.isFinite(hours) ? hours : -1;
};
const toTimestamp = (dateValue) => {
  const parsedDate = dateValue ? new Date(dateValue) : null;
  return (!parsedDate || Number.isNaN(parsedDate.getTime())) ? 0 : parsedDate.getTime();
};

export const getClinicAnalytics = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id)
      .select('_id bankAccount totalEarningsInRupees withdrawnAmountInRupees currentPlan subscriptionStatus planExpiresAt profileCtr')
      .lean();
    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const [doctors, appointments, campaignPromotions] = await Promise.all([
      ClinicDoctor.find({ clinicId: clinic._id })
        .select('fullName specialization availabilitySlots')
        .lean(),
      ClinicDoctorAppointment.find({
        clinicId: clinic._id,
        paymentStatus: 'succeeded',
        bookingStatus: 'confirmed'
      })
        .select('doctorId doctorName doctorSpecialization amountInRupees clinicPayoutInRupees appointmentDate fromTime toTime patientId')
        .lean(),
      CampaignPromotion.find({
        accountRole: 'clinic',
        clinicId: clinic._id
      })
        .select('planName amountInRupees durationDays status activatedAt expiresAt createdAt')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    const doctorStatsById = new Map();
    doctors.forEach((doctor) => {
      const doctorId = String(doctor?._id || '');
      doctorStatsById.set(doctorId, {
        doctorId,
        name: String(doctor?.fullName || '').trim() || 'Doctor',
        specialization: String(doctor?.specialization || '').trim() || 'Consultant',
        appointments: 0,
        revenueInRupees: 0,
        activeSlots: Array.isArray(doctor?.availabilitySlots) ? doctor.availabilitySlots.length : 0
      });
    });

    appointments.forEach((appointment) => {
      const doctorId = String(appointment?.doctorId || '');
      if (!doctorStatsById.has(doctorId)) {
        doctorStatsById.set(doctorId, {
          doctorId,
          name: String(appointment?.doctorName || '').trim() || 'Doctor',
          specialization: String(appointment?.doctorSpecialization || '').trim() || 'Consultant',
          appointments: 0,
          revenueInRupees: 0,
          activeSlots: 0
        });
      }

      const stats = doctorStatsById.get(doctorId);
      stats.appointments += 1;
      stats.revenueInRupees += Math.max(0, Math.trunc(Number(appointment?.clinicPayoutInRupees || appointment?.amountInRupees || 0)));
    });

    const totalAppointments = appointments.length;
    const totalRevenueInRupees = appointments.reduce((sum, appointment) => {
      return sum + Math.max(0, Math.trunc(Number(appointment?.clinicPayoutInRupees || appointment?.amountInRupees || 0)));
    }, 0);
    const totalActiveSlots = doctors.reduce((sum, doctor) => {
      return sum + (Array.isArray(doctor?.availabilitySlots) ? doctor.availabilitySlots.length : 0);
    }, 0);
    const avgRevenuePerDoctorInRupees = doctors.length > 0 ? Math.round(totalRevenueInRupees / doctors.length) : 0;

    const today = new Date();
    const todayKey = formatDateKey(today);
    const trendStartDate = new Date(today);
    trendStartDate.setDate(trendStartDate.getDate() - (DAY_WINDOW - 1));
    const trendStartKey = formatDateKey(trendStartDate);

    const trendMap = new Map();
    for (let dayOffset = DAY_WINDOW - 1; dayOffset >= 0; dayOffset -= 1) {
      const dateValue = new Date(today);
      dateValue.setDate(today.getDate() - dayOffset);
      const dateKey = formatDateKey(dateValue);
      trendMap.set(dateKey, {
        date: dateKey,
        label: dateValue.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        bookings: 0,
        revenueInRupees: 0
      });
    }

    const patientAppointmentsCount = new Map();
    const dayPartCounters = {
      morning: 0,
      afternoon: 0,
      evening: 0
    };

    appointments.forEach((appointment) => {
      const dateKey = String(appointment?.appointmentDate || '').trim();
      const payout = Math.max(0, Math.trunc(Number(appointment?.clinicPayoutInRupees || appointment?.amountInRupees || 0)));

      if (dateKey >= trendStartKey && dateKey <= todayKey && trendMap.has(dateKey)) {
        const currentBucket = trendMap.get(dateKey);
        currentBucket.bookings += 1;
        currentBucket.revenueInRupees += payout;
      }

      const patientId = String(appointment?.patientId || '').trim();
      if (patientId) {
        patientAppointmentsCount.set(patientId, (patientAppointmentsCount.get(patientId) || 0) + 1);
      }

      const appointmentDate = getDateFromKey(dateKey);
      const appointmentInRange = appointmentDate && appointmentDate.getTime() >= trendStartDate.getTime() && appointmentDate.getTime() <= today.getTime();
      if (appointmentInRange) {
        const slotHour = getHourFromTime(appointment?.fromTime);
        if (slotHour >= 5 && slotHour < 12) dayPartCounters.morning += 1;
        else if (slotHour >= 12 && slotHour < 17) dayPartCounters.afternoon += 1;
        else if (slotHour >= 17 && slotHour <= 23) dayPartCounters.evening += 1;
      }
    });

    const uniquePatients = patientAppointmentsCount.size;
    let returningPatients = 0;
    patientAppointmentsCount.forEach((count) => {
      if (count > 1) returningPatients += 1;
    });
    const newPatients = Math.max(0, uniquePatients - returningPatients);
    const conversionRate = clinic.profileCtr > 0
      ? Math.min(100, Number(((totalAppointments / Math.max(1, clinic.profileCtr)) * 100).toFixed(1)))
      : 0;
    const returningRate = uniquePatients > 0
      ? Number(((returningPatients / uniquePatients) * 100).toFixed(1))
      : 0;

    let campaignBookings = 0;
    const promotionWindows = (Array.isArray(campaignPromotions) ? campaignPromotions : []).map((promotion) => ({
      startsAt: toTimestamp(promotion?.activatedAt || promotion?.createdAt),
      endsAt: toTimestamp(promotion?.expiresAt)
    })).filter((window) => window.startsAt > 0 && window.endsAt > window.startsAt);

    if (promotionWindows.length > 0) {
      appointments.forEach((appointment) => {
        const appointmentDate = getDateFromKey(appointment?.appointmentDate);
        if (!appointmentDate) return;
        const appointmentTimestamp = appointmentDate.getTime();
        const matchedWindow = promotionWindows.some((window) => appointmentTimestamp >= window.startsAt && appointmentTimestamp <= window.endsAt);
        if (matchedWindow) campaignBookings += 1;
      });
    }

    const campaignSpendInRupees = (Array.isArray(campaignPromotions) ? campaignPromotions : []).reduce((sum, promotion) => {
      return sum + Math.max(0, Math.trunc(Number(promotion?.amountInRupees || 0)));
    }, 0);
    const campaignsRun = Math.max(0, (Array.isArray(campaignPromotions) ? campaignPromotions.length : 0));
    const activeCampaigns = (Array.isArray(campaignPromotions) ? campaignPromotions : []).filter((promotion) => {
      const status = String(promotion?.status || '').trim().toLowerCase();
      const expiryTimestamp = toTimestamp(promotion?.expiresAt);
      return status === 'active' && expiryTimestamp > Date.now();
    }).length;
    const campaignAttributionRate = totalAppointments > 0
      ? Number(((campaignBookings / totalAppointments) * 100).toFixed(1))
      : 0;

    await Clinic.findByIdAndUpdate(req.user?.id, { $set: { totalEarningsInRupees: totalRevenueInRupees } });

    const normalizedPlan = ['platinum', 'gold', 'diamond'].includes(String(clinic?.currentPlan || '').trim().toLowerCase())
      ? String(clinic.currentPlan).trim().toLowerCase()
      : 'platinum';
    const normalizedStatus = ['active', 'cancelled', 'expired'].includes(String(clinic?.subscriptionStatus || '').trim().toLowerCase())
      ? String(clinic.subscriptionStatus).trim().toLowerCase()
      : 'active';
    const expiryDate = clinic?.planExpiresAt ? new Date(clinic.planExpiresAt) : null;
    const isPaidPlanActive = ['gold', 'diamond'].includes(normalizedPlan)
      && normalizedStatus === 'active'
      && expiryDate
      && !Number.isNaN(expiryDate.getTime())
      && expiryDate.getTime() > Date.now();
    const effectivePlan = isPaidPlanActive ? normalizedPlan : 'platinum';
    const visibleDoctors = effectivePlan === 'platinum'
      ? Array.from(doctorStatsById.values()).slice(0, 3)
      : Array.from(doctorStatsById.values());

    return res.status(200).json({
      overview: {
        totalAppointments,
        totalRevenueInRupees,
        avgRevenuePerDoctorInRupees,
        activeDoctors: doctors.length,
        totalActiveSlots,
        profileCtr: Math.max(0, Math.trunc(Number(clinic.profileCtr || 0))),
        withdrawnAmountInRupees: clinic.withdrawnAmountInRupees || 0,
        availableBalanceInRupees: Math.max(0, totalRevenueInRupees - (clinic.withdrawnAmountInRupees || 0)),
        hasBankAccount: !!clinic.bankAccount?.accountNumber,
        bankAccount: clinic.bankAccount || null,
        currentPlan: effectivePlan
      },
      patientEngagement: {
        uniquePatients,
        returningPatients,
        newPatients,
        conversionRate,
        returningRate,
        dayPartDistribution: [
          { label: 'Morning', bookings: dayPartCounters.morning },
          { label: 'Afternoon', bookings: dayPartCounters.afternoon },
          { label: 'Evening', bookings: dayPartCounters.evening }
        ]
      },
      bookingTrends: [...trendMap.values()],
      diamondAdvancedAnalytics: {
        totalProfileViews: Math.max(0, Math.trunc(Number(clinic.profileCtr || 0))),
        totalBookings: totalAppointments,
        viewsToBookingsConversion: conversionRate,
        campaignsRun,
        activeCampaigns,
        campaignSpendInRupees,
        campaignBookings,
        campaignAttributionRate
      },
      uiTier: effectivePlan,
      doctors: visibleDoctors.sort((first, second) => second.revenueInRupees - first.revenueInRupees)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic analytics', error: error.message });
  }
};
