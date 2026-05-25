const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

const DEFAULT_APPOINTMENT_TIME_ZONE = String(
  process.env.APPOINTMENT_TIME_ZONE ||
  'Asia/Karachi'
).trim() || 'Asia/Karachi';

const formatterByTimeZone = new Map();

const getDateTimeFormatter = (timeZone = DEFAULT_APPOINTMENT_TIME_ZONE) => {
  if (!formatterByTimeZone.has(timeZone)) {
    formatterByTimeZone.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      })
    );
  }

  return formatterByTimeZone.get(timeZone);
};

const normalizeDateValue = (dateValue) => {
  const normalizedDate = String(dateValue || '').trim();
  return DATE_PATTERN.test(normalizedDate) ? normalizedDate : '';
};

const normalizeTimeValue = (timeValue) => {
  const normalizedTime = String(timeValue || '').trim();
  const matched = normalizedTime.match(TIME_PATTERN);

  if (!matched) {
    return '';
  }

  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return '';
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getDateTimePartsInTimeZone = (now = new Date(), timeZone = DEFAULT_APPOINTMENT_TIME_ZONE) => {
  const targetDate = now instanceof Date ? now : new Date(now);

  if (Number.isNaN(targetDate.getTime())) {
    return null;
  }

  try {
    const formatter = getDateTimeFormatter(timeZone);
    const parts = formatter.formatToParts(targetDate);
    const partsLookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    const date = `${partsLookup.year}-${partsLookup.month}-${partsLookup.day}`;
    const time = `${partsLookup.hour}:${partsLookup.minute}`;

    return {
      date: normalizeDateValue(date),
      time: normalizeTimeValue(time)
    };
  } catch {
    const fallbackDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    const fallbackTime = `${String(targetDate.getHours()).padStart(2, '0')}:${String(targetDate.getMinutes()).padStart(2, '0')}`;

    return {
      date: normalizeDateValue(fallbackDate),
      time: normalizeTimeValue(fallbackTime)
    };
  }
};

export const getDateTimeInTimeZone = (now = new Date(), timeZone = DEFAULT_APPOINTMENT_TIME_ZONE) => {
  return getDateTimePartsInTimeZone(now, timeZone);
};

export const isSlotExpiredByTimeZone = (slot, now = new Date(), timeZone = DEFAULT_APPOINTMENT_TIME_ZONE) => {
  const slotDate = normalizeDateValue(slot?.date);
  const slotEndTime = normalizeTimeValue(slot?.toTime);

  if (!slotDate || !slotEndTime) {
    return true;
  }

  const currentDateTime = getDateTimePartsInTimeZone(now, timeZone);

  if (!currentDateTime?.date || !currentDateTime?.time) {
    return true;
  }

  if (slotDate < currentDateTime.date) {
    return true;
  }

  if (slotDate > currentDateTime.date) {
    return false;
  }

  return slotEndTime <= currentDateTime.time;
};

export const getAppointmentLifecycleStatusByTimeZone = ({
  appointmentDate,
  fromTime,
  toTime,
  now = new Date(),
  timeZone = DEFAULT_APPOINTMENT_TIME_ZONE
}) => {
  const normalizedDate = normalizeDateValue(appointmentDate);
  const normalizedFromTime = normalizeTimeValue(fromTime);
  const normalizedToTime = normalizeTimeValue(toTime);

  if (!normalizedDate || !normalizedFromTime || !normalizedToTime) {
    return 'upcoming';
  }

  const currentDateTime = getDateTimePartsInTimeZone(now, timeZone);

  if (!currentDateTime?.date || !currentDateTime?.time) {
    return 'upcoming';
  }

  if (currentDateTime.date < normalizedDate) {
    return 'upcoming';
  }

  if (currentDateTime.date > normalizedDate) {
    return 'completed';
  }

  if (currentDateTime.time < normalizedFromTime) {
    return 'upcoming';
  }

  if (currentDateTime.time >= normalizedToTime) {
    return 'completed';
  }

  return 'ongoing';
};
