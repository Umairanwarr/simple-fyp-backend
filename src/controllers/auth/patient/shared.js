import { Appointment } from '../../../models/Appointment.js';
import { Doctor } from '../../../models/Doctor.js';
import { DoctorProfileVisit } from '../../../models/DoctorProfileVisit.js';
import { Patient } from '../../../models/Patient.js';
import { deleteFromCloudinary, uploadUserAvatarToCloudinary } from '../../../services/cloudinaryService.js';
import {
  sendDoctorAppointmentCancelledEmail,
  sendDoctorAppointmentBookedEmail,
  sendPatientAppointmentCancelledEmail,
  sendPatientAppointmentConfirmationEmail,
  sendVerificationOtpEmail
} from '../../../services/mailService.js';
import { STRIPE_CURRENCY, getStripeClient } from '../../../services/stripeService.js';
import { generateOtp, getOtpExpiryDate, hashOtp } from '../../../utils/otp.js';
import { generateAuthToken } from '../../../utils/token.js';
import crypto from 'crypto';
import mongoose from 'mongoose';

export {
  Appointment,
  Doctor,
  DoctorProfileVisit,
  Patient,
  STRIPE_CURRENCY,
  crypto,
  deleteFromCloudinary,
  generateAuthToken,
  generateOtp,
  getOtpExpiryDate,
  getStripeClient,
  hashOtp,
  mongoose,
  sendDoctorAppointmentCancelledEmail,
  sendDoctorAppointmentBookedEmail,
  sendPatientAppointmentCancelledEmail,
  sendPatientAppointmentConfirmationEmail,
  sendVerificationOtpEmail,
  uploadUserAvatarToCloudinary
};

export const normalizeEmail = (email) => String(email || '').toLowerCase().trim();

const patientProfileEmailPattern = /^\S+@\S+\.\S+$/;

export const getPatientAvatarUrl = (patientRecord) => {
  return String(patientRecord?.avatarDocument?.url || '').trim();
};

export const isValidPatientProfileEmail = (email) => {
  return patientProfileEmailPattern.test(String(email || '').trim());
};

export const getPatientMissingProfileFields = (patientRecord) => {
  const missingFields = [];

  if (!String(patientRecord?.firstName || '').trim()) {
    missingFields.push('firstName');
  }

  if (!String(patientRecord?.lastName || '').trim()) {
    missingFields.push('lastName');
  }

  if (!String(patientRecord?.email || '').trim()) {
    missingFields.push('email');
  }

  if (!String(patientRecord?.phone || '').trim()) {
    missingFields.push('phone');
  }

  if (!String(patientRecord?.location || '').trim()) {
    missingFields.push('location');
  }

  if (!getPatientAvatarUrl(patientRecord)) {
    missingFields.push('avatar');
  }

  return missingFields;
};

export const mapPatientSessionPayload = (patientRecord) => {
  return {
    id: patientRecord?._id,
    email: String(patientRecord?.email || '').trim().toLowerCase(),
    firstName: String(patientRecord?.firstName || '').trim(),
    lastName: String(patientRecord?.lastName || '').trim(),
    phone: String(patientRecord?.phone || '').trim(),
    location: String(patientRecord?.location || '').trim(),
    role: patientRecord?.role,
    avatarUrl: getPatientAvatarUrl(patientRecord)
  };
};

export const mapPatientProfilePayload = (patientRecord) => {
  const missingFields = getPatientMissingProfileFields(patientRecord);

  return {
    firstName: String(patientRecord?.firstName || '').trim(),
    lastName: String(patientRecord?.lastName || '').trim(),
    email: String(patientRecord?.email || '').trim().toLowerCase(),
    phone: String(patientRecord?.phone || '').trim(),
    location: String(patientRecord?.location || '').trim(),
    avatarUrl: getPatientAvatarUrl(patientRecord),
    isProfileComplete: missingFields.length === 0,
    missingFields
  };
};

export const getDoctorAvatarUrl = (doctorRecord) => {
  return String(doctorRecord?.avatarDocument?.url || '').trim();
};

export const allowedConsultationModes = new Set(['online', 'offline']);
export const phoneNumberPattern = /^\d{7,15}$/;

export const escapeRegex = (value) => {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const normalizePhoneNumber = (value) => {
  return String(value || '').replace(/\D/g, '').slice(0, 15);
};

export const normalizeAddressField = (value) => {
  return String(value || '').trim();
};

export const getCommissionBreakdown = (amountInRupees) => {
  const normalizedAmount = Math.max(0, Math.trunc(Number(amountInRupees || 0)));
  const adminCommissionInRupees = Math.max(0, Math.round(normalizedAmount * 0.1));
  const doctorPayoutInRupees = Math.max(0, normalizedAmount - adminCommissionInRupees);

  return {
    amountInRupees: normalizedAmount,
    adminCommissionInRupees,
    doctorPayoutInRupees
  };
};

export const getPatientDisplayName = (patientRecord) => {
  const firstName = String(patientRecord?.firstName || '').trim();
  const lastName = String(patientRecord?.lastName || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || 'Patient';
};

export const parseAppointmentDateTime = ({ date, time }) => {
  const normalizedDate = String(date || '').trim();
  const normalizedTime = String(time || '').trim();

  if (!normalizedDate || !normalizedTime) {
    return null;
  }

  const parsedDate = new Date(`${normalizedDate}T${normalizedTime}:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
};

export const getAppointmentLifecycleStatus = (appointmentRecord, now = new Date()) => {
  const bookingStatus = String(appointmentRecord?.bookingStatus || '').trim();
  const paymentStatus = String(appointmentRecord?.paymentStatus || '').trim();

  if (bookingStatus === 'cancelled') {
    return 'cancelled';
  }

  if (bookingStatus !== 'confirmed' || paymentStatus !== 'succeeded') {
    return 'pending';
  }

  const appointmentEndDateTime = parseAppointmentDateTime({
    date: appointmentRecord?.appointmentDate,
    time: appointmentRecord?.toTime
  });

  if (appointmentEndDateTime && appointmentEndDateTime.getTime() <= now.getTime()) {
    return 'completed';
  }

  return 'upcoming';
};

const getAppointmentStatusLabel = (lifecycleStatus) => {
  if (lifecycleStatus === 'cancelled') {
    return 'Cancelled';
  }

  if (lifecycleStatus === 'completed') {
    return 'Completed';
  }

  if (lifecycleStatus === 'upcoming') {
    return 'Booked';
  }

  return 'Pending';
};

export const toDateTimestamp = (dateValue) => {
  const parsedDate = dateValue ? new Date(dateValue) : null;

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return 0;
  }

  return parsedDate.getTime();
};

export const getAppointmentStartTimestamp = (appointmentRecord) => {
  const appointmentStartDateTime = parseAppointmentDateTime({
    date: appointmentRecord?.appointmentDate,
    time: appointmentRecord?.fromTime
  });

  return appointmentStartDateTime ? appointmentStartDateTime.getTime() : 0;
};

export const getAppointmentHistorySortTimestamp = (appointmentRecord, lifecycleStatus) => {
  if (lifecycleStatus === 'cancelled') {
    return toDateTimestamp(appointmentRecord?.cancelledAt || appointmentRecord?.updatedAt || appointmentRecord?.createdAt);
  }

  if (lifecycleStatus === 'completed') {
    return parseAppointmentDateTime({
      date: appointmentRecord?.appointmentDate,
      time: appointmentRecord?.toTime
    })?.getTime() || toDateTimestamp(appointmentRecord?.paidAt || appointmentRecord?.createdAt);
  }

  return toDateTimestamp(appointmentRecord?.updatedAt || appointmentRecord?.createdAt);
};

export const getNotificationSortTimestamp = (notificationRecord) => {
  return toDateTimestamp(notificationRecord?.createdAt);
};

export const getUnreadNotificationsCount = (notifications, seenAt) => {
  const seenAtTimestamp = toDateTimestamp(seenAt);

  if (seenAtTimestamp <= 0) {
    return notifications.length;
  }

  return notifications.filter((notification) => {
    return getNotificationSortTimestamp(notification) > seenAtTimestamp;
  }).length;
};

export const normalizeAppointmentReviewStatus = (appointmentRecord) => {
  const reviewStatus = String(appointmentRecord?.reviewStatus || '').trim().toLowerCase();

  if (reviewStatus === 'submitted' || reviewStatus === 'skipped') {
    return reviewStatus;
  }

  return 'pending';
};

export const isAppointmentReviewEligible = (appointmentRecord, now = new Date()) => {
  return (
    getAppointmentLifecycleStatus(appointmentRecord, now) === 'completed'
    && String(appointmentRecord?.bookingStatus || '').trim() === 'confirmed'
    && String(appointmentRecord?.paymentStatus || '').trim() === 'succeeded'
    && normalizeAppointmentReviewStatus(appointmentRecord) === 'pending'
  );
};

export const mapPendingReviewAppointment = (appointmentRecord) => {
  return {
    id: String(appointmentRecord?._id || ''),
    appointmentDate: String(appointmentRecord?.appointmentDate || '').trim(),
    fromTime: String(appointmentRecord?.fromTime || '').trim(),
    toTime: String(appointmentRecord?.toTime || '').trim(),
    amountInRupees: Math.max(0, Math.trunc(Number(appointmentRecord?.amountInRupees || 0))),
    doctor: {
      id: String(appointmentRecord?.doctorId || ''),
      name: String(appointmentRecord?.doctorName || '').trim() || 'Doctor',
      image: String(appointmentRecord?.doctorAvatarUrl || '').trim() || '/topdoc.svg'
    }
  };
};

export const normalizeReviewComment = (reviewComment) => {
  return String(reviewComment || '').trim().slice(0, 1000);
};

export const getDoctorRatingSummaryFromReviews = (reviews = []) => {
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

export const mapPatientNotificationFromAppointment = (appointmentRecord) => {
  const bookingStatus = String(appointmentRecord?.bookingStatus || '').trim();
  const paymentStatus = String(appointmentRecord?.paymentStatus || '').trim();
  const cancelledByRole = String(appointmentRecord?.cancelledByRole || '').trim().toLowerCase();
  const refundStatus = String(appointmentRecord?.refundStatus || '').trim().toLowerCase();
  const refundAmountInRupees = Math.max(0, Math.trunc(Number(appointmentRecord?.refundAmountInRupees || 0)));

  const appointmentDate = String(appointmentRecord?.appointmentDate || '').trim();
  const fromTime = String(appointmentRecord?.fromTime || '').trim();
  const toTime = String(appointmentRecord?.toTime || '').trim();
  const doctorName = String(appointmentRecord?.doctorName || '').trim() || 'Doctor';

  if (bookingStatus !== 'cancelled' && !(bookingStatus === 'confirmed' && paymentStatus === 'succeeded')) {
    return null;
  }

  const isCancelled = bookingStatus === 'cancelled';
  const createdAt = isCancelled
    ? appointmentRecord?.cancelledAt || appointmentRecord?.updatedAt || appointmentRecord?.createdAt
    : appointmentRecord?.paidAt || appointmentRecord?.createdAt || appointmentRecord?.updatedAt;

  let cancellationMessage = `Your appointment with ${doctorName} on ${appointmentDate} (${fromTime} - ${toTime}) was cancelled.`;

  if (cancelledByRole === 'doctor') {
    if (refundStatus === 'succeeded' && refundAmountInRupees > 0) {
      cancellationMessage = `Your appointment with ${doctorName} on ${appointmentDate} (${fromTime} - ${toTime}) was cancelled by the doctor. Refund of Rs ${refundAmountInRupees.toLocaleString('en-PK')} has been processed.`;
    } else if (refundStatus === 'pending' && refundAmountInRupees > 0) {
      cancellationMessage = `Your appointment with ${doctorName} on ${appointmentDate} (${fromTime} - ${toTime}) was cancelled by the doctor. Refund of Rs ${refundAmountInRupees.toLocaleString('en-PK')} is being processed.`;
    } else {
      cancellationMessage = `Your appointment with ${doctorName} on ${appointmentDate} (${fromTime} - ${toTime}) was cancelled by the doctor. Please contact support for refund updates.`;
    }
  } else if (cancelledByRole === 'patient') {
    cancellationMessage = `Your appointment with ${doctorName} on ${appointmentDate} (${fromTime} - ${toTime}) was cancelled. No refund will be processed.`;
  }

  return {
    id: `${String(appointmentRecord?._id || '')}:${isCancelled ? 'cancelled' : 'booked'}`,
    appointmentId: String(appointmentRecord?._id || ''),
    type: isCancelled ? 'appointment_cancelled' : 'appointment_booked',
    title: isCancelled ? 'Appointment Cancelled' : 'Appointment Confirmed',
    message: isCancelled
      ? cancellationMessage
      : `Your appointment with ${doctorName} on ${appointmentDate} (${fromTime} - ${toTime}) is booked successfully.`,
    createdAt: createdAt ? new Date(createdAt).toISOString() : null
  };
};

export const mapAppointmentForPatient = (appointmentRecord, { lifecycleStatus = null } = {}) => {
  const resolvedLifecycleStatus = lifecycleStatus || getAppointmentLifecycleStatus(appointmentRecord);

  return {
    id: String(appointmentRecord?._id || ''),
    status: getAppointmentStatusLabel(resolvedLifecycleStatus),
    statusCode: resolvedLifecycleStatus,
    date: String(appointmentRecord?.appointmentDate || '').trim(),
    fromTime: String(appointmentRecord?.fromTime || '').trim(),
    toTime: String(appointmentRecord?.toTime || '').trim(),
    type: appointmentRecord?.consultationMode === 'offline' ? 'Clinic Visit' : 'Video Appointment',
    consultationMode: appointmentRecord?.consultationMode === 'offline' ? 'offline' : 'online',
    amountInRupees: Math.max(0, Math.trunc(Number(appointmentRecord?.amountInRupees || 0))),
    reviewStatus: normalizeAppointmentReviewStatus(appointmentRecord),
    reviewRating: appointmentRecord?.reviewRating ? Math.max(1, Math.min(5, Number(appointmentRecord.reviewRating))) : null,
    reviewComment: String(appointmentRecord?.reviewComment || '').trim(),
    bookedAt: appointmentRecord?.paidAt || appointmentRecord?.createdAt || null,
    cancelledAt: appointmentRecord?.cancelledAt || null,
    completedAt: parseAppointmentDateTime({
      date: appointmentRecord?.appointmentDate,
      time: appointmentRecord?.toTime
    }),
    doctor: {
      id: String(appointmentRecord?.doctorId || ''),
      name: String(appointmentRecord?.doctorName || '').trim() || 'Doctor',
      specialty: '',
      image: String(appointmentRecord?.doctorAvatarUrl || '').trim() || '/topdoc.svg'
    }
  };
};

export const getSlotDateTime = (slot) => {
  return parseAppointmentDateTime({
    date: slot?.date,
    time: slot?.fromTime
  });
};

export const getDoctorNextAvailabilityLabel = (availabilitySlots) => {
  const slotDateTimes = Array.isArray(availabilitySlots)
    ? availabilitySlots.map((slot) => getSlotDateTime(slot)).filter(Boolean).sort((a, b) => a.getTime() - b.getTime())
    : [];

  if (slotDateTimes.length === 0) {
    return 'Check doctor schedule';
  }

  const now = new Date();
  const nextSlot = slotDateTimes.find((slotDate) => slotDate.getTime() >= now.getTime()) || slotDateTimes[0];
  const todayKey = now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const nextSlotDayKey = nextSlot.toDateString();
  let dayLabel = '';

  if (nextSlotDayKey === todayKey) {
    dayLabel = 'Today';
  } else if (nextSlotDayKey === tomorrow.toDateString()) {
    dayLabel = 'Tomorrow';
  } else {
    dayLabel = nextSlot.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }

  const timeLabel = nextSlot.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });

  return `${dayLabel} at ${timeLabel}`;
};

export const mapDoctorForPatientDirectory = (doctorRecord) => {
  const averageRating = Number(doctorRecord?.averageRating || 0);
  const totalReviews = Math.max(0, Math.trunc(Number(doctorRecord?.totalReviews || 0)));

  return {
    id: String(doctorRecord?._id),
    name: String(doctorRecord?.fullName || '').trim() || 'Doctor',
    specialty: String(doctorRecord?.specialization || '').trim() || 'Specialist',
    specialtyTag: String(doctorRecord?.specialization || '').trim() || 'General',
    rating: averageRating > 0 ? averageRating.toFixed(2) : '0.00',
    reviews: `${totalReviews} review${totalReviews === 1 ? '' : 's'}`,
    location: String(doctorRecord?.address || '').trim() || 'Location not provided',
    availability: getDoctorNextAvailabilityLabel(doctorRecord?.availabilitySlots),
    image: getDoctorAvatarUrl(doctorRecord) || '/topdoc.svg'
  };
};

export const mapDoctorSlotsByModeForPatientProfile = (doctorRecord) => {
  const rawSlots = Array.isArray(doctorRecord?.availabilitySlots)
    ? doctorRecord.availabilitySlots
    : [];

  const normalizedSlots = rawSlots
    .map((slot) => {
      const consultationMode = String(slot?.consultationMode || '').trim().toLowerCase();

      if (!allowedConsultationModes.has(consultationMode)) {
        return null;
      }

      const date = String(slot?.date || '').trim();
      const fromTime = String(slot?.fromTime || '').trim();
      const toTime = String(slot?.toTime || '').trim();
      const offlineAddress = consultationMode === 'offline'
        ? String(slot?.offlineAddress || '').trim()
        : '';
      const parsedPriceInRupees = Number(slot?.priceInRupees);
      const priceInRupees = Number.isFinite(parsedPriceInRupees)
        ? Math.max(0, Math.trunc(parsedPriceInRupees))
        : 0;

      if (!date || !fromTime || !toTime) {
        return null;
      }

      return {
        id: String(slot?._id || '').trim(),
        date,
        fromTime,
        toTime,
        consultationMode,
        offlineAddress,
        priceInRupees
      };
    })
    .filter(Boolean)
    .sort((firstSlot, secondSlot) => {
      const firstDateTime = getSlotDateTime({ date: firstSlot.date, fromTime: firstSlot.fromTime });
      const secondDateTime = getSlotDateTime({ date: secondSlot.date, fromTime: secondSlot.fromTime });

      if (firstDateTime && secondDateTime) {
        return firstDateTime.getTime() - secondDateTime.getTime();
      }

      if (firstDateTime) {
        return -1;
      }

      if (secondDateTime) {
        return 1;
      }

      return `${firstSlot.date} ${firstSlot.fromTime}`.localeCompare(`${secondSlot.date} ${secondSlot.fromTime}`);
    });

  return {
    online: normalizedSlots.filter((slot) => slot.consultationMode === 'online'),
    offline: normalizedSlots.filter((slot) => slot.consultationMode === 'offline')
  };
};

export const mapFavoriteDoctorIdStrings = (patientRecord) => {
  const rawFavoriteDoctorIds = Array.isArray(patientRecord?.favoriteDoctorIds)
    ? patientRecord.favoriteDoctorIds
    : [];
  const seenDoctorIds = new Set();

  return rawFavoriteDoctorIds
    .map((doctorId) => String(doctorId || '').trim())
    .filter((doctorId) => {
      if (!doctorId || seenDoctorIds.has(doctorId)) {
        return false;
      }

      seenDoctorIds.add(doctorId);
      return true;
    });
};

export const fetchPatientFavoriteDoctors = async (favoriteDoctorIds) => {
  if (!Array.isArray(favoriteDoctorIds) || favoriteDoctorIds.length === 0) {
    return [];
  }

  const doctors = await Doctor.find({
    _id: { $in: favoriteDoctorIds },
    applicationStatus: { $ne: 'declined' },
    emailVerified: true
  })
    .select('fullName specialization licenseNumber experience address bio avatarDocument availabilitySlots averageRating totalReviews')
    .lean();

  const doctorById = new Map(doctors.map((doctor) => [String(doctor._id), doctor]));

  return favoriteDoctorIds
    .map((doctorId) => doctorById.get(String(doctorId)))
    .filter(Boolean)
    .map((doctor) => mapDoctorForPatientDirectory(doctor));
};

export const parseNames = (displayName, email) => {
  const cleanedDisplayName = String(displayName || '').trim();

  if (cleanedDisplayName) {
    const nameParts = cleanedDisplayName.split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() || 'Patient';
    const lastName = nameParts.join(' ') || 'User';
    return { firstName, lastName };
  }

  const emailPrefix = String(email || 'patient').split('@')[0] || 'patient';
  const normalizedPrefix = emailPrefix.replace(/[^a-zA-Z0-9]/g, '') || 'Patient';

  return {
    firstName: normalizedPrefix,
    lastName: 'User'
  };
};

export const verifyFirebaseIdToken = async (idToken) => {
  const firebaseWebApiKey = String(
    process.env.FIREBASE_WEB_API_KEY ||
    process.env.FIREBASE_API_KEY ||
    ''
  ).trim();

  if (!firebaseWebApiKey) {
    throw new Error('Firebase API key is not configured on backend');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseWebApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ idToken })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !Array.isArray(data?.users) || data.users.length === 0) {
    throw new Error('Invalid Google authentication token');
  }

  return data.users[0];
};