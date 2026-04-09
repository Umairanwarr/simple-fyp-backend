import {
  Doctor,
  getDoctorMissingProfileFields,
  hasOverlappingAvailabilitySlot,
  mapDoctorAvailabilitySlots,
  normalizeConsultationMode,
  normalizePriceInRupees,
  validateAvailabilitySlotPayload
} from './shared.js';

export const getDoctorAvailability = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    return res.status(200).json({
      slots: mapDoctorAvailabilitySlots(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch availability slots', error: error.message });
  }
};

export const createDoctorAvailability = async (req, res) => {
  try {
    const payload = {
      date: String(req.body?.date || '').trim(),
      fromTime: String(req.body?.fromTime || '').trim(),
      toTime: String(req.body?.toTime || '').trim(),
      consultationMode: normalizeConsultationMode(req.body?.consultationMode),
      priceInRupees: normalizePriceInRupees(req.body?.priceInRupees)
    };

    const validationError = validateAvailabilitySlotPayload(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const missingProfileFields = getDoctorMissingProfileFields(doctor);

    if (missingProfileFields.length > 0) {
      return res.status(403).json({
        message: 'Please complete your profile first before adding availability slots',
        missingFields: missingProfileFields
      });
    }

    if (
      hasOverlappingAvailabilitySlot({
        slots: doctor.availabilitySlots,
        ...payload
      })
    ) {
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
        consultationMode: normalizeConsultationMode(insertedSlot.consultationMode) || 'online',
        priceInRupees: Number.isFinite(Number(insertedSlot.priceInRupees))
          ? Math.max(0, Math.trunc(Number(insertedSlot.priceInRupees)))
          : 0
      },
      slots: mapDoctorAvailabilitySlots(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not add availability slot', error: error.message });
  }
};

export const updateDoctorAvailabilitySlot = async (req, res) => {
  try {
    const { slotId } = req.params;

    if (!slotId) {
      return res.status(400).json({ message: 'Slot id is required' });
    }

    const payload = {
      date: String(req.body?.date || '').trim(),
      fromTime: String(req.body?.fromTime || '').trim(),
      toTime: String(req.body?.toTime || '').trim(),
      consultationMode: normalizeConsultationMode(req.body?.consultationMode),
      priceInRupees: normalizePriceInRupees(req.body?.priceInRupees)
    };

    const validationError = validateAvailabilitySlotPayload(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const missingProfileFields = getDoctorMissingProfileFields(doctor);

    if (missingProfileFields.length > 0) {
      return res.status(403).json({
        message: 'Please complete your profile first before adding availability slots',
        missingFields: missingProfileFields
      });
    }

    const existingSlot = doctor.availabilitySlots.id(slotId);

    if (!existingSlot) {
      return res.status(404).json({ message: 'Availability slot not found' });
    }

    if (
      hasOverlappingAvailabilitySlot({
        slots: doctor.availabilitySlots,
        ...payload,
        excludeId: slotId
      })
    ) {
      return res.status(409).json({ message: 'This slot overlaps with an existing slot on the same date' });
    }

    existingSlot.date = payload.date;
    existingSlot.fromTime = payload.fromTime;
    existingSlot.toTime = payload.toTime;
    existingSlot.consultationMode = payload.consultationMode;
    existingSlot.priceInRupees = payload.priceInRupees;
    await doctor.save();

    return res.status(200).json({
      message: 'Availability slot updated',
      slot: {
        id: String(existingSlot._id),
        date: String(existingSlot.date || '').trim(),
        fromTime: String(existingSlot.fromTime || '').trim(),
        toTime: String(existingSlot.toTime || '').trim(),
        consultationMode: normalizeConsultationMode(existingSlot.consultationMode) || 'online',
        priceInRupees: Number.isFinite(Number(existingSlot.priceInRupees))
          ? Math.max(0, Math.trunc(Number(existingSlot.priceInRupees)))
          : 0
      },
      slots: mapDoctorAvailabilitySlots(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update availability slot', error: error.message });
  }
};

export const deleteDoctorAvailabilitySlot = async (req, res) => {
  try {
    const { slotId } = req.params;

    if (!slotId) {
      return res.status(400).json({ message: 'Slot id is required' });
    }

    const doctor = await Doctor.findById(req.user?.id).select('availabilitySlots');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const existingSlot = doctor.availabilitySlots.id(slotId);

    if (!existingSlot) {
      return res.status(404).json({ message: 'Availability slot not found' });
    }

    existingSlot.deleteOne();
    await doctor.save();

    return res.status(200).json({
      message: 'Availability slot deleted',
      slots: mapDoctorAvailabilitySlots(doctor)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not delete availability slot', error: error.message });
  }
};
