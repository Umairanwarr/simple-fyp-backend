import { Admin } from '../../models/Admin.js';
import { Appointment } from '../../models/Appointment.js';
import { BugReport } from '../../models/BugReport.js';
import { Clinic } from '../../models/Clinic.js';
import { Doctor } from '../../models/Doctor.js';
import { DoctorMedia } from '../../models/DoctorMedia.js';
import { DoctorSubscriptionPayment } from '../../models/DoctorSubscriptionPayment.js';
import { MedicalStore } from '../../models/MedicalStore.js';
import { Patient } from '../../models/Patient.js';
import { SubscriptionPricing } from '../../models/SubscriptionPricing.js';
import WithdrawRequest from '../../models/WithdrawRequest.js';
import { StoreOrder } from '../../models/StoreOrder.js';
import { sendClinicApplicationStatusEmail } from '../../services/mailService.js';
import { sendDoctorApplicationStatusEmail } from '../../services/mailService.js';
import { sendMedicalStoreApplicationStatusEmail } from '../../services/mailService.js';
import { generateAuthToken } from '../../utils/token.js';
import mongoose from 'mongoose';

const DOCTOR_SUBSCRIPTION_PRICING_KEY = 'doctor-dashboard-subscriptions';
const STORE_SUBSCRIPTION_PRICING_KEY = 'medical-store-dashboard-subscriptions';

const escapeRegex = (value) => {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const toDateTimestamp = (dateValue) => {
  const parsedDate = dateValue ? new Date(dateValue) : null;

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return 0;
  }

  return parsedDate.getTime();
};

const getUnreadNotificationsCount = (notifications, seenAt) => {
  const seenAtTimestamp = toDateTimestamp(seenAt);

  if (seenAtTimestamp <= 0) {
    return notifications.length;
  }

  return notifications.filter((notification) => {
    return toDateTimestamp(notification?.createdAt) > seenAtTimestamp;
  }).length;
};

const mapAdminReviewNotification = (doctorRecord, reviewRecord) => {
  const safeDoctorName = String(doctorRecord?.fullName || '').trim() || 'Doctor';
  const safePatientName = String(reviewRecord?.patientName || '').trim() || 'Patient';
  const safeRating = Math.max(1, Math.min(5, Math.trunc(Number(reviewRecord?.rating || 0)) || 0));

  return {
    id: `review-${String(reviewRecord?._id || '')}`,
    reviewId: String(reviewRecord?._id || ''),
    appointmentId: String(reviewRecord?.appointmentId || ''),
    type: 'review_submitted',
    title: 'New Doctor Review',
    message: `${safePatientName} submitted a ${safeRating}-star review for Dr. ${safeDoctorName}.`,
    doctorName: safeDoctorName,
    patientName: safePatientName,
    rating: safeRating,
    createdAt: reviewRecord?.createdAt || null
  };
};

const formatReporterRoleLabel = (reporterRole) => {
  const normalizedRole = String(reporterRole || '').trim().toLowerCase();

  if (normalizedRole === 'medical-store') {
    return 'Medical Store';
  }

  if (normalizedRole === 'clinic') {
    return 'Clinic';
  }

  if (normalizedRole === 'doctor') {
    return 'Doctor';
  }

  if (normalizedRole === 'patient') {
    return 'Patient';
  }

  return 'User';
};

const mapAdminBugReportNotification = (bugReportRecord) => {
  const safeReporterName = String(bugReportRecord?.reporterName || '').trim() || 'User';
  const safeReporterRole = formatReporterRoleLabel(bugReportRecord?.reporterRole);
  const safeSubject = String(bugReportRecord?.subject || '').trim() || 'Bug report submitted';

  return {
    id: `bug-${String(bugReportRecord?._id || '')}`,
    bugReportId: String(bugReportRecord?._id || ''),
    type: 'bug_report_submitted',
    title: 'New Bug Report',
    message: `${safeReporterName} (${safeReporterRole}) reported: ${safeSubject}.`,
    reporterName: safeReporterName,
    reporterRole: safeReporterRole,
    subject: safeSubject,
    createdAt: bugReportRecord?.createdAt || null
  };
};

const mapAdminDoctorMediaUploadNotification = (mediaRecord) => {
  const doctorName = String(mediaRecord?.doctorName || '').trim() || 'Doctor';
  const mediaType = String(mediaRecord?.mediaType || '').trim().toLowerCase() === 'video'
    ? 'video'
    : 'image';
  const mediaFileName = String(mediaRecord?.asset?.originalName || '').trim() || `${mediaType}-file`;

  return {
    id: `media-${String(mediaRecord?._id || '')}`,
    mediaId: String(mediaRecord?._id || ''),
    type: 'doctor_media_uploaded',
    title: 'New Doctor Media Upload',
    message: `${doctorName} uploaded a ${mediaType} (${mediaFileName}) for moderation.`,
    doctorName,
    mediaType,
    createdAt: mediaRecord?.createdAt || null
  };
};

const mapAdminWithdrawRequestNotification = (withdrawRequest) => {
  const doctor = withdrawRequest.doctorId;
  const store = withdrawRequest.storeId;
  const requesterName = doctor ? `Dr. ${String(doctor.fullName || '').trim() || 'A doctor'}` : (store ? `Store: ${String(store.name || '').trim() || 'A store'}` : 'A user');
  const amount = Math.trunc(Number(withdrawRequest.amountInRupees || 0));
  
  return {
    id: `withdraw-${String(withdrawRequest._id || '')}`,
    withdrawRequestId: String(withdrawRequest._id || ''),
    type: 'withdraw_request_submitted',
    title: 'New Withdraw Request',
    message: `${requesterName} requested a withdrawal of Rs ${amount.toLocaleString('en-PK')}.`,
    requesterName,
    amountInRupees: amount,
    createdAt: withdrawRequest.createdAt || null
  };
};

const getDoctorRatingSummaryFromReviews = (reviews = []) => {
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  const totalReviews = safeReviews.length;

  if (totalReviews === 0) {
    return {
      totalReviews: 0,
      averageRating: 0
    };
  }

  const totalRating = safeReviews.reduce((sum, review) => {
    return sum + Math.max(1, Math.min(5, Number(review?.rating || 0)));
  }, 0);

  return {
    totalReviews,
    averageRating: Number((totalRating / totalReviews).toFixed(2))
  };
};

const getDefaultDoctorSubscriptionPricing = () => {
  return {
    platinumPriceInRupees: 0,
    goldPriceInRupees: 999,
    diamondPriceInRupees: 2999
  };
};

const normalizePriceInRupees = (value, fallbackValue) => {
  const normalizedFallback = Number.isFinite(Number(fallbackValue))
    ? Number(fallbackValue)
    : 0;

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return Math.max(0, Math.trunc(normalizedFallback));
  }

  return Math.max(0, Math.trunc(numericValue));
};

const mapDoctorSubscriptionPricing = (pricingRecord) => {
  const fallbackPricing = getDefaultDoctorSubscriptionPricing();

  return {
    platinumPriceInRupees: normalizePriceInRupees(
      pricingRecord?.platinumPriceInRupees ?? pricingRecord?.platinumPriceInUsd,
      fallbackPricing.platinumPriceInRupees
    ),
    goldPriceInRupees: normalizePriceInRupees(
      pricingRecord?.goldPriceInRupees ?? pricingRecord?.goldPriceInUsd,
      fallbackPricing.goldPriceInRupees
    ),
    diamondPriceInRupees: normalizePriceInRupees(
      pricingRecord?.diamondPriceInRupees ?? pricingRecord?.diamondPriceInUsd,
      fallbackPricing.diamondPriceInRupees
    ),
    updatedAt: pricingRecord?.updatedAt || null
  };
};

const getDefaultStoreSubscriptionPricing = () => {
  return {
    platinumPriceInRupees: 0,
    goldPriceInRupees: 1499,
    diamondPriceInRupees: 3999
  };
};

const mapStoreSubscriptionPricing = (pricingRecord) => {
  const fallbackPricing = getDefaultStoreSubscriptionPricing();

  return {
    platinumPriceInRupees: normalizePriceInRupees(
      pricingRecord?.platinumPriceInRupees,
      fallbackPricing.platinumPriceInRupees
    ),
    goldPriceInRupees: normalizePriceInRupees(
      pricingRecord?.goldPriceInRupees,
      fallbackPricing.goldPriceInRupees
    ),
    diamondPriceInRupees: normalizePriceInRupees(
      pricingRecord?.diamondPriceInRupees,
      fallbackPricing.diamondPriceInRupees
    ),
    updatedAt: pricingRecord?.updatedAt || null
  };
};

const getOrCreateStoreSubscriptionPricing = async () => {
  const fallbackPricing = getDefaultStoreSubscriptionPricing();

  return SubscriptionPricing.findOneAndUpdate(
    {
      key: STORE_SUBSCRIPTION_PRICING_KEY
    },
    {
      $setOnInsert: {
        key: STORE_SUBSCRIPTION_PRICING_KEY,
        ...fallbackPricing
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  ).lean();
};

const getOrCreateDoctorSubscriptionPricing = async () => {
  const fallbackPricing = getDefaultDoctorSubscriptionPricing();

  return SubscriptionPricing.findOneAndUpdate(
    {
      key: DOCTOR_SUBSCRIPTION_PRICING_KEY
    },
    {
      $setOnInsert: {
        key: DOCTOR_SUBSCRIPTION_PRICING_KEY,
        ...fallbackPricing
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  ).lean();
};

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() });

    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateAuthToken(
      { id: admin._id, email: admin.email, role: admin.role },
      '24h'
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getDoctorSubscriptionPricingForAdmin = async (req, res) => {
  try {
    const pricingRecord = await getOrCreateDoctorSubscriptionPricing();

    return res.status(200).json({
      pricing: mapDoctorSubscriptionPricing(pricingRecord)
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not fetch subscription pricing',
      error: error.message
    });
  }
};

export const updateDoctorSubscriptionPricingForAdmin = async (req, res) => {
  try {
    const {
      platinumPriceInRupees,
      goldPriceInRupees,
      diamondPriceInRupees,
      platinumPriceInUsd,
      goldPriceInUsd,
      diamondPriceInUsd
    } = req.body || {};

    const resolvedPlatinumPrice = platinumPriceInRupees ?? platinumPriceInUsd;
    const resolvedGoldPrice = goldPriceInRupees ?? goldPriceInUsd;
    const resolvedDiamondPrice = diamondPriceInRupees ?? diamondPriceInUsd;

    const inputValues = [
      resolvedPlatinumPrice,
      resolvedGoldPrice,
      resolvedDiamondPrice
    ];

    const hasInvalidValue = inputValues.some((priceValue) => {
      if (priceValue === null || priceValue === undefined || priceValue === '') {
        return true;
      }

      const numericValue = Number(priceValue);

      return !Number.isFinite(numericValue) || numericValue < 0;
    });

    if (hasInvalidValue) {
      return res.status(400).json({
        message: 'All price fields are required and must be non-negative numbers'
      });
    }

    const updatedRecord = await SubscriptionPricing.findOneAndUpdate(
      {
        key: DOCTOR_SUBSCRIPTION_PRICING_KEY
      },
      {
        $set: {
          platinumPriceInRupees: normalizePriceInRupees(resolvedPlatinumPrice, 0),
          goldPriceInRupees: normalizePriceInRupees(resolvedGoldPrice, 999),
          diamondPriceInRupees: normalizePriceInRupees(resolvedDiamondPrice, 2999),
          updatedByAdminId: req.user?.id || null
        },
        $unset: {
          platinumPriceInUsd: '',
          goldPriceInUsd: '',
          diamondPriceInUsd: ''
        },
        $setOnInsert: {
          key: DOCTOR_SUBSCRIPTION_PRICING_KEY
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    return res.status(200).json({
      message: 'Doctor subscription pricing updated successfully',
      pricing: mapDoctorSubscriptionPricing(updatedRecord)
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not update subscription pricing',
      error: error.message
    });
  }
};

export const getStoreSubscriptionPricingForAdmin = async (req, res) => {
  try {
    const pricingRecord = await getOrCreateStoreSubscriptionPricing();

    return res.status(200).json({
      pricing: mapStoreSubscriptionPricing(pricingRecord)
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not fetch store subscription pricing',
      error: error.message
    });
  }
};

export const updateStoreSubscriptionPricingForAdmin = async (req, res) => {
  try {
    const {
      platinumPriceInRupees,
      goldPriceInRupees,
      diamondPriceInRupees
    } = req.body || {};

    const inputValues = [
      platinumPriceInRupees,
      goldPriceInRupees,
      diamondPriceInRupees
    ];

    const hasInvalidValue = inputValues.some((priceValue) => {
      if (priceValue === null || priceValue === undefined || priceValue === '') {
        return true;
      }

      const numericValue = Number(priceValue);

      return !Number.isFinite(numericValue) || numericValue < 0;
    });

    if (hasInvalidValue) {
      return res.status(400).json({
        message: 'All price fields are required and must be non-negative numbers'
      });
    }

    const updatedRecord = await SubscriptionPricing.findOneAndUpdate(
      {
        key: STORE_SUBSCRIPTION_PRICING_KEY
      },
      {
        $set: {
          platinumPriceInRupees: normalizePriceInRupees(platinumPriceInRupees, 0),
          goldPriceInRupees: normalizePriceInRupees(goldPriceInRupees, 1499),
          diamondPriceInRupees: normalizePriceInRupees(diamondPriceInRupees, 3999),
          updatedByAdminId: req.user?.id || null
        },
        $setOnInsert: {
          key: STORE_SUBSCRIPTION_PRICING_KEY
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    return res.status(200).json({
      message: 'Store subscription pricing updated successfully',
      pricing: mapStoreSubscriptionPricing(updatedRecord)
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not update store subscription pricing',
      error: error.message
    });
  }
};

export const getPatientsForAdmin = async (req, res) => {
  try {
    const patients = await Patient.find()
      .sort({ createdAt: -1 })
      .select('firstName lastName email isVerified createdAt');

    const normalizedPatients = patients.map((patient) => ({
      id: patient._id,
      name: `${patient.firstName} ${patient.lastName}`.trim(),
      email: patient.email,
      joined: patient.createdAt,
      status: patient.isVerified ? 'Active' : 'Pending Verification'
    }));

    return res.status(200).json({ patients: normalizedPatients });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getAdminStats = async (req, res) => {
  try {
    const now = new Date();
    const activePaidPlanFilters = {
      currentPlan: {
        $in: ['gold', 'diamond']
      },
      subscriptionStatus: 'active',
      planExpiresAt: {
        $gt: now
      }
    };

    const [
      totalPatients,
      verifiedPatients,
      totalDoctors,
      approvedDoctors,
      totalClinics,
      approvedClinics,
      totalMedicalStores,
      approvedMedicalStores,
      totalGoldDoctors,
      totalDiamondDoctors,
      totalGoldStores,
      totalDiamondStores,
      appointmentMetrics,
      subscriptionMetrics,
      recentCommissions,
      premiumDoctors,
      premiumStores
    ] = await Promise.all([
      Patient.countDocuments(),
      Patient.countDocuments({ isVerified: true }),
      Doctor.countDocuments(),
      Doctor.countDocuments({ applicationStatus: 'approved' }),
      Clinic.countDocuments(),
      Clinic.countDocuments({ applicationStatus: 'approved' }),
      MedicalStore.countDocuments(),
      MedicalStore.countDocuments({ applicationStatus: 'approved' }),
      Doctor.countDocuments({
        ...activePaidPlanFilters,
        currentPlan: 'gold'
      }),
      Doctor.countDocuments({
        ...activePaidPlanFilters,
        currentPlan: 'diamond'
      }),
      MedicalStore.countDocuments({
        ...activePaidPlanFilters,
        currentPlan: 'gold'
      }),
      MedicalStore.countDocuments({
        ...activePaidPlanFilters,
        currentPlan: 'diamond'
      }),
      Appointment.aggregate([
        {
          $match: {
            paymentStatus: 'succeeded'
          }
        },
        {
          $group: {
            _id: null,
            totalConfirmedAppointments: {
              $sum: 1
            },
            totalBookingRevenueInRupees: {
              $sum: '$amountInRupees'
            },
            totalAdminCommissionInRupees: {
              $sum: '$adminCommissionInRupees'
            }
          }
        }
      ]),
      DoctorSubscriptionPayment.aggregate([
        {
          $match: {
            status: 'succeeded'
          }
        },
        {
          $group: {
            _id: null,
            totalSubscriptionRevenueInRupees: {
              $sum: '$amountInRupees'
            }
          }
        }
      ]),
      Appointment.find({
        paymentStatus: 'succeeded'
      })
        .select('doctorName patientName amountInRupees adminCommissionInRupees paidAt createdAt')
        .sort({ paidAt: -1, createdAt: -1 })
        .limit(8)
        .lean(),
      Doctor.find(activePaidPlanFilters)
        .select('fullName email phone specialization currentPlan planActivatedAt planExpiresAt lastPlanPaymentAt')
        .sort({ lastPlanPaymentAt: -1, planActivatedAt: -1 })
        .limit(100)
        .lean(),
      MedicalStore.find(activePaidPlanFilters)
        .select('name email phone currentPlan planActivatedAt planExpiresAt lastPlanPaymentAt')
        .sort({ lastPlanPaymentAt: -1, planActivatedAt: -1 })
        .limit(100)
        .lean()
    ]);

    const normalizedAppointmentMetrics = Array.isArray(appointmentMetrics)
      ? appointmentMetrics[0] || {}
      : {};
    const normalizedSubscriptionMetrics = Array.isArray(subscriptionMetrics)
      ? subscriptionMetrics[0] || {}
      : {};
    const appointmentBookingRevenueInRupees = Math.max(
      0,
      Math.trunc(Number(normalizedAppointmentMetrics?.totalBookingRevenueInRupees || 0))
    );
    const totalSubscriptionRevenueInRupees = Math.max(
      0,
      Math.trunc(Number(normalizedSubscriptionMetrics?.totalSubscriptionRevenueInRupees || 0))
    );
    const totalPlatformRevenueInRupees = appointmentBookingRevenueInRupees + totalSubscriptionRevenueInRupees;

    return res.status(200).json({
      totalPatients,
      verifiedPatients,
      totalDoctors,
      approvedDoctors,
      totalClinics,
      approvedClinics,
      totalMedicalStores,
      approvedMedicalStores,
      totalGoldDoctors,
      totalDiamondDoctors,
      totalGoldStores,
      totalDiamondStores,
      totalConfirmedAppointments: Math.max(
        0,
        Math.trunc(Number(normalizedAppointmentMetrics?.totalConfirmedAppointments || 0))
      ),
      totalBookingRevenueInRupees: totalPlatformRevenueInRupees,
      appointmentBookingRevenueInRupees,
      totalSubscriptionRevenueInRupees,
      totalAdminCommissionInRupees: Math.max(
        0,
        Math.trunc(Number(normalizedAppointmentMetrics?.totalAdminCommissionInRupees || 0))
      ),
      premiumUsers: [
        ...(Array.isArray(premiumDoctors)
          ? premiumDoctors.map((doc) => ({
              id: String(doc?._id || ''),
              fullName: String(doc?.fullName || '').trim() || 'Doctor',
              email: String(doc?.email || '').trim() || 'N/A',
              phone: String(doc?.phone || '').trim() || 'N/A',
              role: 'Doctor',
              currentPlan: String(doc?.currentPlan || '').trim().toLowerCase() || 'platinum',
              planActivatedAt: doc?.planActivatedAt || null,
              planExpiresAt: doc?.planExpiresAt || null,
              purchasedAt: doc?.lastPlanPaymentAt || doc?.planActivatedAt || null
            }))
          : []),
        ...(Array.isArray(premiumStores)
          ? premiumStores.map((store) => ({
              id: String(store?._id || ''),
              fullName: String(store?.name || '').trim() || 'Store',
              email: String(store?.email || '').trim() || 'N/A',
              phone: String(store?.phone || '').trim() || 'N/A',
              role: 'Store',
              currentPlan: String(store?.currentPlan || '').trim().toLowerCase() || 'platinum',
              planActivatedAt: store?.planActivatedAt || null,
              planExpiresAt: store?.planExpiresAt || null,
              purchasedAt: store?.lastPlanPaymentAt || store?.planActivatedAt || null
            }))
          : [])
      ].sort((a, b) => new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0)),
      recentCommissions: Array.isArray(recentCommissions)
        ? recentCommissions.map((commissionRecord) => ({
            id: String(commissionRecord?._id || ''),
            doctorName: String(commissionRecord?.doctorName || '').trim() || 'Doctor',
            patientName: String(commissionRecord?.patientName || '').trim() || 'Patient',
            amountInRupees: Math.max(0, Math.trunc(Number(commissionRecord?.amountInRupees || 0))),
            adminCommissionInRupees: Math.max(
              0,
              Math.trunc(Number(commissionRecord?.adminCommissionInRupees || 0))
            ),
            paidAt: commissionRecord?.paidAt || commissionRecord?.createdAt || null
          }))
        : []
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getAdminNotifications = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user?.id)
      .select('notificationsSeenAt')
      .lean();

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const [doctors, bugReports, pendingDoctorMedia, pendingWithdraws] = await Promise.all([
      Doctor.find({
        'reviews.0': {
          $exists: true
        }
      })
        .select('fullName reviews')
        .lean(),
      BugReport.find({})
        .select('reporterName reporterRole subject createdAt')
        .sort({ createdAt: -1 })
        .limit(80)
        .lean(),
      DoctorMedia.find({
        deletedAt: null,
        moderationStatus: 'pending'
      })
        .select('doctorName mediaType asset.originalName createdAt')
        .sort({ createdAt: -1 })
        .limit(80)
        .lean(),
      WithdrawRequest.find({ status: 'pending' })
        .populate('doctorId', 'fullName')
        .populate('storeId', 'name')
        .sort({ createdAt: -1 })
        .limit(80)
        .lean()
    ]);

    const reviewNotifications = doctors
      .flatMap((doctor) => {
        const reviews = Array.isArray(doctor?.reviews) ? doctor.reviews : [];

        return reviews.map((review) => mapAdminReviewNotification(doctor, review));
      })
      .sort((firstNotification, secondNotification) => {
        return toDateTimestamp(secondNotification?.createdAt) - toDateTimestamp(firstNotification?.createdAt);
      });

    const bugReportNotifications = bugReports.map((bugReport) => mapAdminBugReportNotification(bugReport));
    const mediaNotifications = pendingDoctorMedia.map((mediaRecord) => {
      return mapAdminDoctorMediaUploadNotification(mediaRecord);
    });
    const withdrawNotifications = (pendingWithdraws || []).map((req) => mapAdminWithdrawRequestNotification(req));

    const notifications = [...bugReportNotifications, ...reviewNotifications, ...mediaNotifications, ...withdrawNotifications]
      .sort((firstNotification, secondNotification) => {
        return toDateTimestamp(secondNotification?.createdAt) - toDateTimestamp(firstNotification?.createdAt);
      })
      .slice(0, 40);

    return res.status(200).json({
      notifications,
      unreadCount: getUnreadNotificationsCount(notifications, admin.notificationsSeenAt)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch admin notifications', error: error.message });
  }
};

export const markAdminNotificationsAsRead = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user?.id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    admin.notificationsSeenAt = new Date();
    await admin.save();

    return res.status(200).json({ message: 'Notifications marked as read' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not mark notifications as read', error: error.message });
  }
};

export const getDoctorReviewsForAdmin = async (req, res) => {
  try {
    const doctorNameQuery = String(req.query?.doctorName || '').trim();
    const doctorFilters = {
      'reviews.0': {
        $exists: true
      }
    };

    if (doctorNameQuery) {
      doctorFilters.fullName = {
        $regex: escapeRegex(doctorNameQuery),
        $options: 'i'
      };
    }

    const doctors = await Doctor.find(doctorFilters)
      .select('fullName specialization averageRating totalReviews reviews')
      .sort({ updatedAt: -1 })
      .lean();

    const reviews = doctors
      .flatMap((doctor) => {
        const doctorReviews = Array.isArray(doctor?.reviews) ? doctor.reviews : [];

        return doctorReviews.map((review) => ({
          id: String(review?._id || ''),
          appointmentId: String(review?.appointmentId || ''),
          doctorId: String(doctor?._id || ''),
          doctorName: String(doctor?.fullName || '').trim() || 'Doctor',
          doctorSpecialization: String(doctor?.specialization || '').trim() || 'Specialist',
          doctorAverageRating: Number(Number(doctor?.averageRating || 0).toFixed(2)),
          doctorTotalReviews: Math.max(0, Math.trunc(Number(doctor?.totalReviews || 0))),
          patientName: String(review?.patientName || '').trim() || 'Patient',
          rating: Math.max(1, Math.min(5, Math.trunc(Number(review?.rating || 0)) || 0)),
          comment: String(review?.comment || '').trim(),
          createdAt: review?.createdAt || null
        }));
      })
      .sort((firstReview, secondReview) => {
        const firstTimestamp = firstReview?.createdAt ? new Date(firstReview.createdAt).getTime() : 0;
        const secondTimestamp = secondReview?.createdAt ? new Date(secondReview.createdAt).getTime() : 0;
        return secondTimestamp - firstTimestamp;
      });

    return res.status(200).json({ reviews });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctor reviews', error: error.message });
  }
};

export const getStoreReviewsForAdmin = async (req, res) => {
  try {
    const storeNameQuery = String(req.query?.storeName || '').trim();
    const storeFilters = {
      'reviews.0': {
        $exists: true
      }
    };

    if (storeNameQuery) {
      storeFilters.name = {
        $regex: escapeRegex(storeNameQuery),
        $options: 'i'
      };
    }

    const stores = await MedicalStore.find(storeFilters)
      .select('name averageRating totalReviews reviews')
      .sort({ updatedAt: -1 })
      .lean();

    const reviews = stores
      .flatMap((store) => {
        const storeReviews = Array.isArray(store?.reviews) ? store.reviews : [];

        return storeReviews.map((review) => ({
          id: String(review?._id || ''),
          storeId: String(store?._id || ''),
          storeName: String(store?.name || '').trim() || 'Store',
          patientName: String(review?.patientName || '').trim() || 'Patient',
          rating: Math.max(1, Math.min(5, Math.trunc(Number(review?.rating || 0)) || 0)),
          comment: String(review?.comment || '').trim(),
          createdAt: review?.createdAt || null
        }));
      })
      .sort((a, b) => {
        const firstTimestamp = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const secondTimestamp = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return secondTimestamp - firstTimestamp;
      });

    return res.status(200).json({ reviews });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch store reviews', error: error.message });
  }
};

export const deleteStoreReviewForAdmin = async (req, res) => {
  try {
    const { reviewId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ message: 'Invalid review id' });
    }

    const store = await MedicalStore.findOne({
      'reviews._id': reviewId
    });

    if (!store) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Keep only reviews that don't match the reviewId
    store.reviews = store.reviews.filter(r => String(r._id) !== String(reviewId));
    
    // Recalculate averages
    const totalReviews = store.reviews.length;
    const sum = store.reviews.reduce((acc, r) => acc + r.rating, 0);
    store.totalReviews = totalReviews;
    store.averageRating = totalReviews > 0 ? parseFloat((sum / totalReviews).toFixed(2)) : 0;

    await store.save();

    return res.status(200).json({ message: 'Store review deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not delete store review', error: error.message });
  }
};

export const deleteDoctorReviewForAdmin = async (req, res) => {
  try {
    const { reviewId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ message: 'Invalid review id' });
    }

    const doctor = await Doctor.findOne({
      'reviews._id': reviewId
    })
      .select('reviews averageRating totalReviews');

    if (!doctor) {
      return res.status(404).json({ message: 'Review not found' });
    }

    doctor.reviews = doctor.reviews.filter((review) => String(review?._id || '') !== String(reviewId));

    const ratingSummary = getDoctorRatingSummaryFromReviews(doctor.reviews);
    doctor.totalReviews = ratingSummary.totalReviews;
    doctor.averageRating = ratingSummary.averageRating;
    await doctor.save();

    return res.status(200).json({ message: 'Review deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not delete doctor review', error: error.message });
  }
};

export const deletePatientForAdmin = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ message: 'Invalid patient id' });
    }

    const deletedPatient = await Patient.findByIdAndDelete(patientId);

    if (!deletedPatient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    return res.status(200).json({ message: 'Patient deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deleteDoctorForAdmin = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid doctor id' });
    }

    const deletedDoctor = await Doctor.findByIdAndDelete(doctorId);

    if (!deletedDoctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    return res.status(200).json({ message: 'Doctor deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deleteClinicForAdmin = async (req, res) => {
  try {
    const { clinicId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({ message: 'Invalid clinic id' });
    }

    const deletedClinic = await Clinic.findByIdAndDelete(clinicId);

    if (!deletedClinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    return res.status(200).json({ message: 'Clinic deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deleteMedicalStoreForAdmin = async (req, res) => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ message: 'Invalid medical store id' });
    }

    const deletedMedicalStore = await MedicalStore.findByIdAndDelete(storeId);

    if (!deletedMedicalStore) {
      return res.status(404).json({ message: 'Medical store not found' });
    }

    return res.status(200).json({ message: 'Medical store deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getDoctorsForAdmin = async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .sort({ createdAt: -1 })
      .select(
        'fullName email phone specialization licenseNumber experience address licenseDocument emailVerified applicationStatus adminReviewNote reviewedAt createdAt'
      );

    const normalizedDoctors = doctors.map((doctor) => ({
      id: doctor._id,
      fullName: doctor.fullName,
      email: doctor.email,
      phone: doctor.phone,
      specialization: doctor.specialization,
      licenseNumber: doctor.licenseNumber,
      experience: doctor.experience,
      address: doctor.address,
      licenseDocument: doctor.licenseDocument,
      emailVerified: doctor.emailVerified,
      applicationStatus: doctor.applicationStatus,
      adminReviewNote: doctor.adminReviewNote,
      reviewedAt: doctor.reviewedAt,
      joinedAt: doctor.createdAt
    }));

    return res.status(200).json({ doctors: normalizedDoctors });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const reviewDoctorApplicationForAdmin = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const {
      status,
      applicationStatus,
      decision,
      note = '',
      reviewNote = ''
    } = req.body;

    const incomingStatus = String(
      status || applicationStatus || decision || req.query?.status || ''
    )
      .trim()
      .toLowerCase();

    const normalizedStatus = incomingStatus === 'approve'
      ? 'approved'
      : incomingStatus === 'decline'
        ? 'declined'
        : incomingStatus;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid doctor id' });
    }

    if (!['approved', 'declined'].includes(normalizedStatus)) {
      return res.status(400).json({ message: 'Status must be either approved or declined' });
    }

    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    doctor.applicationStatus = normalizedStatus;
    doctor.adminReviewNote = String(note || reviewNote || '').trim();
    doctor.reviewedAt = new Date();
    doctor.reviewedBy = req.user?.id || null;
    await doctor.save();

    await sendDoctorApplicationStatusEmail({
      to: doctor.email,
      fullName: doctor.fullName,
      status: normalizedStatus
    });

    return res.status(200).json({
      message: `Doctor application ${normalizedStatus} successfully`,
      doctor: {
        id: doctor._id,
        fullName: doctor.fullName,
        email: doctor.email,
        phone: doctor.phone,
        specialization: doctor.specialization,
        licenseNumber: doctor.licenseNumber,
        experience: doctor.experience,
        address: doctor.address,
        licenseDocument: doctor.licenseDocument,
        emailVerified: doctor.emailVerified,
        applicationStatus: doctor.applicationStatus,
        adminReviewNote: doctor.adminReviewNote,
        reviewedAt: doctor.reviewedAt,
        joinedAt: doctor.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getClinicsForAdmin = async (req, res) => {
  try {
    const clinics = await Clinic.find()
      .sort({ createdAt: -1 })
      .select(
        'name email phone facilityType address permitDocument emailVerified applicationStatus adminReviewNote reviewedAt createdAt'
      );

    const normalizedClinics = clinics.map((clinic) => ({
      id: clinic._id,
      name: clinic.name,
      email: clinic.email,
      phone: clinic.phone,
      facilityType: clinic.facilityType,
      address: clinic.address,
      permitDocument: clinic.permitDocument,
      emailVerified: clinic.emailVerified,
      applicationStatus: clinic.applicationStatus,
      adminReviewNote: clinic.adminReviewNote,
      reviewedAt: clinic.reviewedAt,
      joinedAt: clinic.createdAt
    }));

    return res.status(200).json({ clinics: normalizedClinics });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const reviewClinicApplicationForAdmin = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const {
      status,
      applicationStatus,
      decision,
      note = '',
      reviewNote = ''
    } = req.body;

    const incomingStatus = String(
      status || applicationStatus || decision || req.query?.status || ''
    )
      .trim()
      .toLowerCase();

    const normalizedStatus = incomingStatus === 'approve'
      ? 'approved'
      : incomingStatus === 'decline'
        ? 'declined'
        : incomingStatus;

    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({ message: 'Invalid clinic id' });
    }

    if (!['approved', 'declined'].includes(normalizedStatus)) {
      return res.status(400).json({ message: 'Status must be either approved or declined' });
    }

    const clinic = await Clinic.findById(clinicId);

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    clinic.applicationStatus = normalizedStatus;
    clinic.adminReviewNote = String(note || reviewNote || '').trim();
    clinic.reviewedAt = new Date();
    clinic.reviewedBy = req.user?.id || null;
    await clinic.save();

    await sendClinicApplicationStatusEmail({
      to: clinic.email,
      clinicName: clinic.name,
      status: normalizedStatus
    });

    return res.status(200).json({
      message: `Clinic application ${normalizedStatus} successfully`,
      clinic: {
        id: clinic._id,
        name: clinic.name,
        email: clinic.email,
        phone: clinic.phone,
        facilityType: clinic.facilityType,
        address: clinic.address,
        permitDocument: clinic.permitDocument,
        emailVerified: clinic.emailVerified,
        applicationStatus: clinic.applicationStatus,
        adminReviewNote: clinic.adminReviewNote,
        reviewedAt: clinic.reviewedAt,
        joinedAt: clinic.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getMedicalStoresForAdmin = async (req, res) => {
  try {
    const stores = await MedicalStore.find()
      .sort({ createdAt: -1 })
      .select(
        'name email phone licenseNumber address operatingHours licenseDocument emailVerified applicationStatus adminReviewNote reviewedAt createdAt'
      );

    const normalizedStores = stores.map((store) => ({
      id: store._id,
      name: store.name,
      email: store.email,
      phone: store.phone,
      licenseNumber: store.licenseNumber,
      address: store.address,
      operatingHours: store.operatingHours,
      licenseDocument: store.licenseDocument,
      emailVerified: store.emailVerified,
      applicationStatus: store.applicationStatus,
      adminReviewNote: store.adminReviewNote,
      reviewedAt: store.reviewedAt,
      joinedAt: store.createdAt
    }));

    return res.status(200).json({ stores: normalizedStores });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const reviewMedicalStoreApplicationForAdmin = async (req, res) => {
  try {
    const { storeId } = req.params;
    const {
      status,
      applicationStatus,
      decision,
      note = '',
      reviewNote = ''
    } = req.body;

    const incomingStatus = String(
      status || applicationStatus || decision || req.query?.status || ''
    )
      .trim()
      .toLowerCase();

    const normalizedStatus = incomingStatus === 'approve'
      ? 'approved'
      : incomingStatus === 'decline'
        ? 'declined'
        : incomingStatus;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ message: 'Invalid medical store id' });
    }

    if (!['approved', 'declined'].includes(normalizedStatus)) {
      return res.status(400).json({ message: 'Status must be either approved or declined' });
    }

    const store = await MedicalStore.findById(storeId);

    if (!store) {
      return res.status(404).json({ message: 'Medical store not found' });
    }

    store.applicationStatus = normalizedStatus;
    store.adminReviewNote = String(note || reviewNote || '').trim();
    store.reviewedAt = new Date();
    store.reviewedBy = req.user?.id || null;
    await store.save();

    await sendMedicalStoreApplicationStatusEmail({
      to: store.email,
      storeName: store.name,
      status: normalizedStatus
    });

    return res.status(200).json({
      message: `Medical store application ${normalizedStatus} successfully`,
      store: {
        id: store._id,
        name: store.name,
        email: store.email,
        phone: store.phone,
        licenseNumber: store.licenseNumber,
        address: store.address,
        operatingHours: store.operatingHours,
        licenseDocument: store.licenseDocument,
        emailVerified: store.emailVerified,
        applicationStatus: store.applicationStatus,
        adminReviewNote: store.adminReviewNote,
        reviewedAt: store.reviewedAt,
        joinedAt: store.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
