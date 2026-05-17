import mongoose from 'mongoose';
import { Clinic } from '../../../models/Clinic.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';
import { ClinicService } from '../../../models/ClinicService.js';
import { toMinutes } from './appointmentShared.js';
const parseSlotDateTime = ({ date, time }) => {
  const normalizedDate = String(date || '').trim();
  const normalizedTime = String(time || '').trim();
  if (!normalizedDate || !normalizedTime) return null;
  const parsed = new Date(`${normalizedDate}T${normalizedTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSlotExpired = (slot, now = new Date()) => {
  const slotEnd = parseSlotDateTime({ date: slot?.date, time: slot?.toTime });
  if (!slotEnd) return true;
  return slotEnd.getTime() <= now.getTime();
};

const isServiceManageAllowed = (clinicRecord) => {
  const normalizedPlan = String(clinicRecord?.currentPlan || '').trim().toLowerCase();
  const normalizedStatus = String(clinicRecord?.subscriptionStatus || '').trim().toLowerCase();
  const expiryTimestamp = clinicRecord?.planExpiresAt ? new Date(clinicRecord.planExpiresAt).getTime() : 0;
  const isPaidPlanActive = (normalizedPlan === 'gold' || normalizedPlan === 'diamond')
    && normalizedStatus === 'active'
    && expiryTimestamp > Date.now();
  return isPaidPlanActive;
};

const mapClinicServicePayload = (serviceRecord) => ({
  id: String(serviceRecord?._id || ''),
  name: String(serviceRecord?.name || '').trim(),
  serviceType: String(serviceRecord?.serviceType || '').trim().toLowerCase() === 'facility' ? 'facility' : 'lab',
  isActive: Boolean(serviceRecord?.isActive),
  createdAt: serviceRecord?.createdAt || null,
  slots: (Array.isArray(serviceRecord?.availabilitySlots) ? serviceRecord.availabilitySlots : []).map((slot) => ({
    id: String(slot?._id || ''),
    date: String(slot?.date || '').trim(),
    fromTime: String(slot?.fromTime || '').trim(),
    toTime: String(slot?.toTime || '').trim(),
    consultationMode: String(slot?.consultationMode || 'offline').trim().toLowerCase(),
    priceInRupees: Math.max(0, Math.trunc(Number(slot?.priceInRupees || 0)))
  }))
});

const validateServiceName = (value) => String(value || '').trim().slice(0, 120);
const normalizeServiceType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'facility' ? 'facility' : (normalized === 'lab' ? 'lab' : '');
};

const removeExpiredServiceSlots = async (service) => {
  if (!service || !Array.isArray(service.availabilitySlots)) return;
  const now = new Date();
  const activeSlots = service.availabilitySlots.filter((slot) => !isSlotExpired(slot, now));
  if (activeSlots.length !== service.availabilitySlots.length) {
    service.availabilitySlots = activeSlots;
    await service.save();
  }
};

export const getClinicServices = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id).select('_id');
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });

    const services = await ClinicService.find({ clinicId: clinic._id }).sort({ createdAt: -1 });
    await Promise.all(services.map((service) => removeExpiredServiceSlots(service)));
    return res.status(200).json({ services: services.map(mapClinicServicePayload) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic services', error: error.message });
  }
};

export const createClinicService = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id).select('name email currentPlan subscriptionStatus planExpiresAt');
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });
    if (!isServiceManageAllowed(clinic)) return res.status(403).json({ message: 'Upgrade to Gold or Diamond plan to manage labs and facilities' });

    const name = validateServiceName(req.body?.name);
    const serviceType = normalizeServiceType(req.body?.serviceType);
    if (!name || !serviceType) return res.status(400).json({ message: 'Service name and type are required' });

    const service = await ClinicService.create({
      clinicId: clinic._id,
      clinicName: String(clinic.name || '').trim(),
      clinicEmail: String(clinic.email || '').trim().toLowerCase(),
      name,
      serviceType,
      isActive: true
    });

    return res.status(201).json({ message: 'Service created successfully', service: mapClinicServicePayload(service) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not create clinic service', error: error.message });
  }
};

export const updateClinicService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(serviceId)) return res.status(400).json({ message: 'Invalid service id' });

    const clinic = await Clinic.findById(req.user?.id).select('currentPlan subscriptionStatus planExpiresAt');
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });
    if (!isServiceManageAllowed(clinic)) return res.status(403).json({ message: 'Upgrade to Gold or Diamond plan to manage labs and facilities' });

    const service = await ClinicService.findOne({ _id: serviceId, clinicId: req.user?.id });
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const name = validateServiceName(req.body?.name);
    const serviceType = normalizeServiceType(req.body?.serviceType);
    const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : service.isActive;

    if (!name || !serviceType) return res.status(400).json({ message: 'Service name and type are required' });

    service.name = name;
    service.serviceType = serviceType;
    service.isActive = isActive;
    await service.save();

    return res.status(200).json({ message: 'Service updated successfully', service: mapClinicServicePayload(service) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update clinic service', error: error.message });
  }
};

export const deleteClinicService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(serviceId)) return res.status(400).json({ message: 'Invalid service id' });

    const clinic = await Clinic.findById(req.user?.id).select('currentPlan subscriptionStatus planExpiresAt');
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });
    if (!isServiceManageAllowed(clinic)) return res.status(403).json({ message: 'Upgrade to Gold or Diamond plan to manage labs and facilities' });

    const service = await ClinicService.findOne({ _id: serviceId, clinicId: req.user?.id });
    if (!service) return res.status(404).json({ message: 'Service not found' });

    await ClinicService.deleteOne({ _id: service._id });
    await ClinicDoctorAppointment.deleteMany({
      clinicId: req.user?.id,
      serviceId: service._id,
      providerType: 'service',
      bookingStatus: { $in: ['pending', 'confirmed'] }
    });

    return res.status(200).json({ message: 'Service deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not delete clinic service', error: error.message });
  }
};

export const getClinicServiceAvailability = async (req, res) => {
  try {
    const { serviceId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(serviceId)) return res.status(400).json({ message: 'Invalid service id' });

    const service = await ClinicService.findOne({ _id: serviceId, clinicId: req.user?.id });
    if (!service) return res.status(404).json({ message: 'Service not found' });

    await removeExpiredServiceSlots(service);

    return res.status(200).json({ service: mapClinicServicePayload(service), slots: mapClinicServicePayload(service).slots });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch service availability', error: error.message });
  }
};

export const createClinicServiceAvailability = async (req, res) => {
  try {
    const { serviceId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(serviceId)) return res.status(400).json({ message: 'Invalid service id' });

    const clinic = await Clinic.findById(req.user?.id).select('currentPlan subscriptionStatus planExpiresAt');
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });
    if (!isServiceManageAllowed(clinic)) return res.status(403).json({ message: 'Upgrade to Gold or Diamond plan to manage labs and facilities' });

    const service = await ClinicService.findOne({ _id: serviceId, clinicId: req.user?.id });
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const date = String(req.body?.date || '').trim();
    const fromTime = String(req.body?.fromTime || '').trim();
    const toTime = String(req.body?.toTime || '').trim();
    const priceInRupees = Math.max(0, Math.trunc(Number(req.body?.priceInRupees || 0)));

    if (!date || !fromTime || !toTime) return res.status(400).json({ message: 'Date, from time and to time are required' });
    if (toMinutes(fromTime) >= toMinutes(toTime)) return res.status(400).json({ message: 'Start time must be earlier than end time' });
    if (priceInRupees <= 0) return res.status(400).json({ message: 'Price must be greater than 0' });
    if (isSlotExpired({ date, toTime })) return res.status(400).json({ message: 'Availability slot must be in current or future time' });

    const hasOverlap = (Array.isArray(service.availabilitySlots) ? service.availabilitySlots : []).some((slot) => {
      if (String(slot?.date || '') !== date) return false;
      const existingStart = toMinutes(slot?.fromTime);
      const existingEnd = toMinutes(slot?.toTime);
      const incomingStart = toMinutes(fromTime);
      const incomingEnd = toMinutes(toTime);
      return incomingStart < existingEnd && incomingEnd > existingStart;
    });
    if (hasOverlap) return res.status(409).json({ message: 'This slot overlaps with existing service slot' });

    service.availabilitySlots.push({
      date,
      fromTime,
      toTime,
      consultationMode: 'offline',
      priceInRupees
    });
    await service.save();

    return res.status(201).json({ message: 'Service slot added successfully', slots: mapClinicServicePayload(service).slots });
  } catch (error) {
    return res.status(500).json({ message: 'Could not add service slot', error: error.message });
  }
};

export const updateClinicServiceAvailabilitySlot = async (req, res) => {
  try {
    const { serviceId, slotId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(serviceId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ message: 'Invalid service id or slot id' });
    }

    const clinic = await Clinic.findById(req.user?.id).select('currentPlan subscriptionStatus planExpiresAt');
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });
    if (!isServiceManageAllowed(clinic)) return res.status(403).json({ message: 'Upgrade to Gold or Diamond plan to manage labs and facilities' });

    const service = await ClinicService.findOne({ _id: serviceId, clinicId: req.user?.id });
    if (!service) return res.status(404).json({ message: 'Service not found' });
    const slot = service.availabilitySlots.id(slotId);
    if (!slot) return res.status(404).json({ message: 'Slot not found' });

    const date = String(req.body?.date || slot.date).trim();
    const fromTime = String(req.body?.fromTime || slot.fromTime).trim();
    const toTime = String(req.body?.toTime || slot.toTime).trim();
    const priceInRupees = Math.max(0, Math.trunc(Number(req.body?.priceInRupees ?? slot.priceInRupees ?? 0)));

    if (!date || !fromTime || !toTime) return res.status(400).json({ message: 'Date, from time and to time are required' });
    if (toMinutes(fromTime) >= toMinutes(toTime)) return res.status(400).json({ message: 'Start time must be earlier than end time' });
    if (priceInRupees <= 0) return res.status(400).json({ message: 'Price must be greater than 0' });
    if (isSlotExpired({ date, toTime })) return res.status(400).json({ message: 'Availability slot must be in current or future time' });

    const hasOverlap = (Array.isArray(service.availabilitySlots) ? service.availabilitySlots : []).some((existingSlot) => {
      if (String(existingSlot?._id || '') === String(slotId)) return false;
      if (String(existingSlot?.date || '') !== date) return false;
      const existingStart = toMinutes(existingSlot?.fromTime);
      const existingEnd = toMinutes(existingSlot?.toTime);
      const incomingStart = toMinutes(fromTime);
      const incomingEnd = toMinutes(toTime);
      return incomingStart < existingEnd && incomingEnd > existingStart;
    });
    if (hasOverlap) return res.status(409).json({ message: 'This slot overlaps with existing service slot' });

    slot.date = date;
    slot.fromTime = fromTime;
    slot.toTime = toTime;
    slot.consultationMode = 'offline';
    slot.priceInRupees = priceInRupees;
    await service.save();

    return res.status(200).json({ message: 'Service slot updated successfully', slots: mapClinicServicePayload(service).slots });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update service slot', error: error.message });
  }
};

export const deleteClinicServiceAvailabilitySlot = async (req, res) => {
  try {
    const { serviceId, slotId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(serviceId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ message: 'Invalid service id or slot id' });
    }

    const clinic = await Clinic.findById(req.user?.id).select('currentPlan subscriptionStatus planExpiresAt');
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });
    if (!isServiceManageAllowed(clinic)) return res.status(403).json({ message: 'Upgrade to Gold or Diamond plan to manage labs and facilities' });

    const service = await ClinicService.findOne({ _id: serviceId, clinicId: req.user?.id });
    if (!service) return res.status(404).json({ message: 'Service not found' });
    const slot = service.availabilitySlots.id(slotId);
    if (!slot) return res.status(404).json({ message: 'Slot not found' });

    service.availabilitySlots.pull(slotId);
    await service.save();

    return res.status(200).json({ message: 'Service slot deleted successfully', slots: mapClinicServicePayload(service).slots });
  } catch (error) {
    return res.status(500).json({ message: 'Could not delete service slot', error: error.message });
  }
};
