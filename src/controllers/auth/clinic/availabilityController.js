import mongoose from 'mongoose';
import { Clinic } from '../../../models/Clinic.js';
import { ClinicDoctor } from '../../../models/ClinicDoctor.js';

const normalizeConsultationMode = (mode) => {
  const m = String(mode || '').toLowerCase().trim();
  if (m === 'offline') return 'offline';
  if (m === 'video') return 'video';
  return 'online';
};

const normalizeAddress = (address) => {
  return String(address || '').trim().slice(0, 240);
};

const normalizePrice = (price) => {
  const parsed = Number(price);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
};

const toMinutes = (timeValue) => {
  const [hours, minutes] = String(timeValue || '').split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
};

const isValidDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date || '').trim());
const isValidTime = (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(time || '').trim());

const hasOverlappingSlot = ({ slots, date, fromTime, toTime, excludeId = null }) => {
  const newStart = toMinutes(fromTime);
  const newEnd = toMinutes(toTime);

  return slots.some((slot) => {
    if (excludeId && String(slot._id) === String(excludeId)) return false;
    if (slot.date !== date) return false;

    const existingStart = toMinutes(slot.fromTime);
    const existingEnd = toMinutes(slot.toTime);

    return newStart < existingEnd && newEnd > existingStart;
  });
};

const mapSlots = (doctor) => {
  if (!doctor?.availabilitySlots) return [];
  return doctor.availabilitySlots.map((slot) => ({
    id: String(slot._id),
    date: String(slot.date || '').trim(),
    fromTime: String(slot.fromTime || '').trim(),
    toTime: String(slot.toTime || '').trim(),
    consultationMode: normalizeConsultationMode(slot.consultationMode),
    offlineAddress: normalizeConsultationMode(slot.consultationMode) === 'offline'
      ? normalizeAddress(slot.offlineAddress)
      : '',
    priceInRupees: normalizePrice(slot.priceInRupees)
  }));
};

const validateSlotPayload = (payload) => {
  if (!isValidDate(payload.date)) return 'Date must be in YYYY-MM-DD format';
  if (!isValidTime(payload.fromTime) || !isValidTime(payload.toTime)) {
    return 'Time must be in HH:MM 24-hour format';
  }
  if (toMinutes(payload.fromTime) >= toMinutes(payload.toTime)) {
    return 'Start time must be earlier than end time';
  }
  if (payload.consultationMode === 'offline' && !payload.offlineAddress) {
    return 'Offline clinic address is required for clinic visit slots';
  }
  if (payload.priceInRupees <= 0) {
    return 'Consultation fee must be greater than 0';
  }
  return null;
};

export const getClinicDoctorAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Valid doctor id is required' });
    }

    const clinic = await Clinic.findById(req.user?.id).lean();
    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const doctor = await ClinicDoctor.findOne({
      _id: doctorId,
      clinicId: clinic._id
    }).select('fullName specialization avatarDocument availabilitySlots');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found in your clinic' });
    }

    return res.status(200).json({
      doctor: {
        id: String(doctor._id),
        fullName: String(doctor.fullName || '').trim(),
        specialization: String(doctor.specialization || '').trim(),
        avatarUrl: String(doctor?.avatarDocument?.url || '').trim()
      },
      slots: mapSlots(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch availability slots', error: error.message });
  }
};

export const getAllClinicDoctorsAvailability = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id).lean();
    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const doctors = await ClinicDoctor.find({ clinicId: clinic._id })
      .select('fullName specialization avatarDocument availabilitySlots')
      .sort({ fullName: 1 });

    const doctorsWithSlots = doctors.map((doctor) => ({
      doctor: {
        id: String(doctor._id),
        fullName: String(doctor.fullName || '').trim(),
        specialization: String(doctor.specialization || '').trim(),
        avatarUrl: String(doctor?.avatarDocument?.url || '').trim()
      },
      slots: mapSlots(doctor),
      totalSlots: (doctor.availabilitySlots || []).length
    }));

    return res.status(200).json({
      doctors: doctorsWithSlots,
      totalDoctors: doctorsWithSlots.length
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctors availability', error: error.message });
  }
};

export const createClinicDoctorAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const {
      date,
      fromTime,
      toTime,
      consultationMode = 'online',
      offlineAddress = '',
      priceInRupees = 0
    } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Valid doctor id is required' });
    }

    const normalizedMode = normalizeConsultationMode(consultationMode);
    const payload = {
      date: String(date || '').trim(),
      fromTime: String(fromTime || '').trim(),
      toTime: String(toTime || '').trim(),
      consultationMode: normalizedMode,
      offlineAddress: normalizedMode === 'offline' ? normalizeAddress(offlineAddress) : '',
      priceInRupees: normalizePrice(priceInRupees)
    };

    const validationError = validateSlotPayload(payload);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const clinic = await Clinic.findById(req.user?.id).lean();
    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const doctor = await ClinicDoctor.findOne({
      _id: doctorId,
      clinicId: clinic._id
    });

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found in your clinic' });
    }

    if (hasOverlappingSlot({ slots: doctor.availabilitySlots || [], ...payload })) {
      return res.status(409).json({ message: 'This slot overlaps with an existing slot on the same date' });
    }

    doctor.availabilitySlots.push(payload);
    await doctor.save();

    const insertedSlot = doctor.availabilitySlots[doctor.availabilitySlots.length - 1];

    return res.status(201).json({
      message: 'Availability slot added',
      slot: {
        id: String(insertedSlot._id),
        date: String(insertedSlot.date || '').trim(),
        fromTime: String(insertedSlot.fromTime || '').trim(),
        toTime: String(insertedSlot.toTime || '').trim(),
        consultationMode: normalizeConsultationMode(insertedSlot.consultationMode),
        offlineAddress: normalizeConsultationMode(insertedSlot.consultationMode) === 'offline'
          ? normalizeAddress(insertedSlot.offlineAddress)
          : '',
        priceInRupees: normalizePrice(insertedSlot.priceInRupees)
      },
      slots: mapSlots(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not add availability slot', error: error.message });
  }
};

export const updateClinicDoctorAvailabilitySlot = async (req, res) => {
  try {
    const { doctorId, slotId } = req.params;
    const {
      date,
      fromTime,
      toTime,
      consultationMode = 'online',
      offlineAddress = '',
      priceInRupees = 0
    } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(doctorId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ message: 'Valid doctor id and slot id are required' });
    }

    const normalizedMode = normalizeConsultationMode(consultationMode);
    const payload = {
      date: String(date || '').trim(),
      fromTime: String(fromTime || '').trim(),
      toTime: String(toTime || '').trim(),
      consultationMode: normalizedMode,
      offlineAddress: normalizedMode === 'offline' ? normalizeAddress(offlineAddress) : '',
      priceInRupees: normalizePrice(priceInRupees)
    };

    const validationError = validateSlotPayload(payload);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const clinic = await Clinic.findById(req.user?.id).lean();
    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const doctor = await ClinicDoctor.findOne({
      _id: doctorId,
      clinicId: clinic._id
    });

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found in your clinic' });
    }

    const existingSlot = doctor.availabilitySlots.id(slotId);
    if (!existingSlot) {
      return res.status(404).json({ message: 'Availability slot not found' });
    }

    if (hasOverlappingSlot({ slots: doctor.availabilitySlots || [], ...payload, excludeId: slotId })) {
      return res.status(409).json({ message: 'This slot overlaps with an existing slot on the same date' });
    }

    existingSlot.date = payload.date;
    existingSlot.fromTime = payload.fromTime;
    existingSlot.toTime = payload.toTime;
    existingSlot.consultationMode = payload.consultationMode;
    existingSlot.offlineAddress = payload.offlineAddress;
    existingSlot.priceInRupees = payload.priceInRupees;
    await doctor.save();

    return res.status(200).json({
      message: 'Availability slot updated',
      slot: {
        id: String(existingSlot._id),
        date: String(existingSlot.date || '').trim(),
        fromTime: String(existingSlot.fromTime || '').trim(),
        toTime: String(existingSlot.toTime || '').trim(),
        consultationMode: normalizeConsultationMode(existingSlot.consultationMode),
        offlineAddress: normalizeConsultationMode(existingSlot.consultationMode) === 'offline'
          ? normalizeAddress(existingSlot.offlineAddress)
          : '',
        priceInRupees: normalizePrice(existingSlot.priceInRupees)
      },
      slots: mapSlots(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update availability slot', error: error.message });
  }
};

export const deleteClinicDoctorAvailabilitySlot = async (req, res) => {
  try {
    const { doctorId, slotId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ message: 'Valid doctor id and slot id are required' });
    }

    const clinic = await Clinic.findById(req.user?.id).lean();
    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const doctor = await ClinicDoctor.findOne({
      _id: doctorId,
      clinicId: clinic._id
    });

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found in your clinic' });
    }

    const existingSlot = doctor.availabilitySlots.id(slotId);
    if (!existingSlot) {
      return res.status(404).json({ message: 'Availability slot not found' });
    }

    existingSlot.deleteOne();
    await doctor.save();

    return res.status(200).json({
      message: 'Availability slot deleted',
      slots: mapSlots(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not delete availability slot', error: error.message });
  }
};
