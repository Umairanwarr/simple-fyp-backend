import { Appointment } from '../../../models/Appointment.js';
import { Doctor } from '../../../models/Doctor.js';
import {
  deleteFromCloudinary,
  uploadDoctorLicenseToCloudinary,
  uploadUserAvatarToCloudinary
} from '../../../services/cloudinaryService.js';
import { sendVerificationOtpEmail } from '../../../services/mailService.js';
import { generateOtp, getOtpExpiryDate, hashOtp } from '../../../utils/otp.js';
import { generateAuthToken } from '../../../utils/token.js';

export {
  Appointment,
  Doctor,
  deleteFromCloudinary,
  generateAuthToken,
  generateOtp,
  getOtpExpiryDate,
  hashOtp,
  sendVerificationOtpEmail,
  uploadDoctorLicenseToCloudinary,
  uploadUserAvatarToCloudinary
};

export const normalizeEmail = (email) => String(email || '').toLowerCase().trim();

export const getDoctorAvatarUrl = (doctorRecord) => {
  return String(doctorRecord?.avatarDocument?.url || '').trim();
};

export const getDoctorMissingProfileFields = (doctorRecord) => {
  const missingFields = [];

  if (!String(doctorRecord?.fullName || '').trim()) {
    missingFields.push('name');
  }

  if (!getDoctorAvatarUrl(doctorRecord)) {
    missingFields.push('avatar');
  }

  if (!String(doctorRecord?.phone || '').trim()) {
    missingFields.push('phone');
  }

  if (!String(doctorRecord?.address || '').trim()) {
    missingFields.push('address');
  }

  if (!String(doctorRecord?.bio || '').trim()) {
    missingFields.push('bio');
  }

  return missingFields;
};

export const mapDoctorSessionPayload = (doctorRecord) => {
  return {
    id: doctorRecord._id,
    fullName: doctorRecord.fullName,
    email: doctorRecord.email,
    phone: String(doctorRecord.phone || '').trim(),
    specialization: String(doctorRecord.specialization || '').trim(),
    licenseNumber: String(doctorRecord.licenseNumber || '').trim(),
    experience: Number(doctorRecord.experience || 0),
    address: String(doctorRecord.address || '').trim(),
    bio: String(doctorRecord.bio || '').trim(),
    role: doctorRecord.role,
    applicationStatus: doctorRecord.applicationStatus,
    profileCtr: Math.max(0, Math.trunc(Number(doctorRecord.profileCtr || 0))),
    avatarUrl: getDoctorAvatarUrl(doctorRecord)
  };
};

export const mapDoctorProfilePayload = (doctorRecord) => {
  const missingFields = getDoctorMissingProfileFields(doctorRecord);

  return {
    fullName: String(doctorRecord.fullName || '').trim(),
    email: String(doctorRecord.email || '').trim(),
    phone: String(doctorRecord.phone || '').trim(),
    specialization: String(doctorRecord.specialization || '').trim(),
    licenseNumber: String(doctorRecord.licenseNumber || '').trim(),
    experience: Number(doctorRecord.experience || 0),
    address: String(doctorRecord.address || '').trim(),
    bio: String(doctorRecord.bio || '').trim(),
    avatarUrl: getDoctorAvatarUrl(doctorRecord),
    isProfileComplete: missingFields.length === 0,
    missingFields
  };
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const allowedConsultationModes = new Set(['online', 'offline']);

export const normalizeConsultationMode = (consultationMode) => {
  return String(consultationMode || '').trim().toLowerCase();
};

export const normalizePriceInRupees = (priceValue) => {
  const parsedPrice = Number(priceValue);

  if (!Number.isFinite(parsedPrice)) {
    return Number.NaN;
  }

  return Math.trunc(parsedPrice);
};

const toMinutes = (timeValue) => {
  const [hours, minutes] = String(timeValue || '').split(':').map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
};

export const isValidCalendarDate = (dateValue) => {
  if (!datePattern.test(dateValue)) {
    return false;
  }

  const [year, month, day] = dateValue.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  return (
    parsedDate.getUTCFullYear() === year
    && parsedDate.getUTCMonth() === month - 1
    && parsedDate.getUTCDate() === day
  );
};

export const validateAvailabilitySlotPayload = ({ date, fromTime, toTime, consultationMode, priceInRupees }) => {
  if (!date || !fromTime || !toTime || !consultationMode) {
    return 'Date, from time, to time, and consultation mode are required';
  }

  if (Number.isNaN(priceInRupees)) {
    return 'Consultation fee in Rs. is required';
  }

  if (!Number.isInteger(priceInRupees) || priceInRupees <= 0) {
    return 'Consultation fee in Rs. must be a whole number greater than 0';
  }

  if (!isValidCalendarDate(String(date).trim())) {
    return 'Date must be in YYYY-MM-DD format';
  }

  if (!timePattern.test(String(fromTime).trim()) || !timePattern.test(String(toTime).trim())) {
    return 'Time must be in HH:MM 24-hour format';
  }

  if (toMinutes(fromTime) >= toMinutes(toTime)) {
    return 'Start time must be earlier than end time';
  }

  if (!allowedConsultationModes.has(normalizeConsultationMode(consultationMode))) {
    return 'Consultation mode must be online or offline';
  }

  return null;
};

export const hasOverlappingAvailabilitySlot = ({ slots, date, fromTime, toTime, excludeId = '' }) => {
  const incomingDate = String(date || '').trim();
  const incomingStart = toMinutes(fromTime);
  const incomingEnd = toMinutes(toTime);

  return slots.some((slot) => {
    if (excludeId && String(slot._id) === String(excludeId)) {
      return false;
    }

    if (String(slot.date || '').trim() !== incomingDate) {
      return false;
    }

    const slotStart = toMinutes(slot.fromTime);
    const slotEnd = toMinutes(slot.toTime);

    return incomingStart < slotEnd && incomingEnd > slotStart;
  });
};

export const mapDoctorAvailabilitySlots = (doctorRecord) => {
  const rawSlots = Array.isArray(doctorRecord?.availabilitySlots) ? doctorRecord.availabilitySlots : [];

  return rawSlots
    .map((slot) => ({
      id: String(slot._id),
      date: String(slot.date || '').trim(),
      fromTime: String(slot.fromTime || '').trim(),
      toTime: String(slot.toTime || '').trim(),
      consultationMode: allowedConsultationModes.has(normalizeConsultationMode(slot.consultationMode))
        ? normalizeConsultationMode(slot.consultationMode)
        : 'online',
      priceInRupees: Number.isFinite(Number(slot.priceInRupees))
        ? Math.max(0, Math.trunc(Number(slot.priceInRupees)))
        : 0
    }))
    .sort((firstSlot, secondSlot) => {
      const dateCompare = firstSlot.date.localeCompare(secondSlot.date);

      if (dateCompare !== 0) {
        return dateCompare;
      }

      return toMinutes(firstSlot.fromTime) - toMinutes(secondSlot.fromTime);
    });
};

export const toDateTimestamp = (dateValue) => {
  const parsedDate = dateValue ? new Date(dateValue) : null;

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return 0;
  }

  return parsedDate.getTime();
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

export const mapDoctorReviewRecord = (reviewRecord) => {
  return {
    id: String(reviewRecord?._id || ''),
    appointmentId: String(reviewRecord?.appointmentId || ''),
    patientName: String(reviewRecord?.patientName || '').trim() || 'Patient',
    rating: Math.max(1, Math.min(5, Math.trunc(Number(reviewRecord?.rating || 0)) || 0)),
    comment: String(reviewRecord?.comment || '').trim(),
    createdAt: reviewRecord?.createdAt || null
  };
};

export const mapDoctorNotificationFromAppointment = (appointmentRecord) => {
  const bookingStatus = String(appointmentRecord?.bookingStatus || '').trim();
  const paymentStatus = String(appointmentRecord?.paymentStatus || '').trim();
  const patientName = String(appointmentRecord?.patientName || '').trim() || 'Patient';
  const appointmentDate = String(appointmentRecord?.appointmentDate || '').trim();
  const fromTime = String(appointmentRecord?.fromTime || '').trim();
  const toTime = String(appointmentRecord?.toTime || '').trim();

  if (bookingStatus === 'cancelled') {
    const createdAt = appointmentRecord?.cancelledAt || appointmentRecord?.updatedAt || appointmentRecord?.createdAt;

    return {
      id: `${String(appointmentRecord?._id || '')}:cancelled`,
      appointmentId: String(appointmentRecord?._id || ''),
      type: 'appointment_cancelled',
      title: 'Appointment Cancelled',
      message: `${patientName} cancelled the appointment on ${appointmentDate} (${fromTime} - ${toTime}).`,
      createdAt: createdAt ? new Date(createdAt).toISOString() : null
    };
  }

  if (bookingStatus === 'confirmed' && paymentStatus === 'succeeded') {
    const createdAt = appointmentRecord?.paidAt || appointmentRecord?.createdAt || appointmentRecord?.updatedAt;

    return {
      id: `${String(appointmentRecord?._id || '')}:booked`,
      appointmentId: String(appointmentRecord?._id || ''),
      type: 'appointment_booked',
      title: 'New Appointment Booked',
      message: `${patientName} booked an appointment on ${appointmentDate} (${fromTime} - ${toTime}).`,
      createdAt: createdAt ? new Date(createdAt).toISOString() : null
    };
  }

  return null;
};

export const mapDoctorScheduleRecord = (appointmentRecord) => {
  return {
    id: String(appointmentRecord?._id || ''),
    patientName: String(appointmentRecord?.patientName || '').trim() || 'Patient',
    patientEmail: String(appointmentRecord?.patientEmail || '').trim() || 'N/A',
    patientPhoneNumber: String(appointmentRecord?.contactPhoneNumber || '').trim() || 'N/A',
    appointmentDate: String(appointmentRecord?.appointmentDate || '').trim(),
    fromTime: String(appointmentRecord?.fromTime || '').trim(),
    toTime: String(appointmentRecord?.toTime || '').trim(),
    consultationMode: normalizeConsultationMode(appointmentRecord?.consultationMode) || 'online',
    bookingStatus: String(appointmentRecord?.bookingStatus || '').trim() === 'cancelled'
      ? 'cancelled'
      : 'confirmed',
    amountInRupees: Math.max(0, Math.trunc(Number(appointmentRecord?.amountInRupees || 0))),
    paidAt: appointmentRecord?.paidAt || null,
    cancelledAt: appointmentRecord?.cancelledAt || null,
    createdAt: appointmentRecord?.createdAt || null,
    updatedAt: appointmentRecord?.updatedAt || null
  };
};