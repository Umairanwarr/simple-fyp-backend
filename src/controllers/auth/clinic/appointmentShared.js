const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const allowedConsultationModes = new Set(['online', 'offline', 'video']);

export const normalizeConsultationMode = (consultationMode) => {
  return String(consultationMode || '').trim().toLowerCase();
};

export const isValidCalendarDate = (dateValue) => {
  if (!datePattern.test(String(dateValue || '').trim())) {
    return false;
  }

  const [year, month, day] = String(dateValue).split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  return (
    parsedDate.getUTCFullYear() === year
    && parsedDate.getUTCMonth() === month - 1
    && parsedDate.getUTCDate() === day
  );
};

export const isValidTimeValue = (timeValue) => {
  return timePattern.test(String(timeValue || '').trim());
};

export const isAllowedConsultationMode = (consultationMode) => {
  return allowedConsultationModes.has(normalizeConsultationMode(consultationMode));
};

export const toMinutes = (timeValue) => {
  const [hours, minutes] = String(timeValue || '').split(':').map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
};

export const parseClinicAppointmentDateTime = ({ date, time }) => {
  const normalizedDate = String(date || '').trim();
  const normalizedTime = String(time || '').trim();

  if (!normalizedDate || !normalizedTime) {
    return null;
  }

  const parsedDateTime = new Date(`${normalizedDate}T${normalizedTime}:00`);

  if (Number.isNaN(parsedDateTime.getTime())) {
    return null;
  }

  return parsedDateTime;
};

export const getClinicAppointmentLifecycleStatus = (appointmentRecord, now = new Date()) => {
  const bookingStatus = String(appointmentRecord?.bookingStatus || '').trim().toLowerCase();

  if (bookingStatus === 'cancelled') {
    return 'cancelled';
  }

  if (bookingStatus !== 'confirmed') {
    return 'cancelled';
  }

  const appointmentStart = parseClinicAppointmentDateTime({
    date: appointmentRecord?.appointmentDate,
    time: appointmentRecord?.fromTime
  });
  const appointmentEnd = parseClinicAppointmentDateTime({
    date: appointmentRecord?.appointmentDate,
    time: appointmentRecord?.toTime
  });

  if (appointmentStart && now.getTime() < appointmentStart.getTime()) {
    return 'upcoming';
  }

  if (appointmentStart && appointmentEnd && now.getTime() >= appointmentStart.getTime() && now.getTime() < appointmentEnd.getTime()) {
    return 'ongoing';
  }

  if (appointmentEnd && now.getTime() >= appointmentEnd.getTime()) {
    return 'completed';
  }

  return 'upcoming';
};
