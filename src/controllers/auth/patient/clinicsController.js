import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { Clinic } from '../../../models/Clinic.js';
import { ClinicDoctor } from '../../../models/ClinicDoctor.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';
import { ClinicProfileVisit } from '../../../models/ClinicProfileVisit.js';
import { ClinicService } from '../../../models/ClinicService.js';
import { DoctorMedia } from '../../../models/DoctorMedia.js';
import { Patient } from '../../../models/Patient.js';
import { CampaignPromotion } from '../../../models/CampaignPromotion.js';
import { STRIPE_CURRENCY, getStripeClient } from '../../../services/stripeService.js';
import {
  sendPatientClinicAppointmentBookedEmail,
  sendClinicAppointmentBookedEmail
} from '../../../services/mailService.js';

const phoneNumberPattern = /^\d{7,15}$/;

const normalizePhoneNumber = (value) => String(value || '').replace(/\D/g, '').slice(0, 15);
const normalizeAddressField = (value) => String(value || '').trim();
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const getPatientDisplayName = (patientRecord) => {
  const fullName = `${String(patientRecord?.firstName || '').trim()} ${String(patientRecord?.lastName || '').trim()}`.trim();
  return fullName || 'Patient';
};
const getCommissionBreakdown = (amountInRupees) => {
  const amount = Math.max(0, Math.trunc(Number(amountInRupees || 0)));
  const adminCommissionInRupees = Math.max(0, Math.round(amount * 0.1));
  return {
    amountInRupees: amount,
    adminCommissionInRupees,
    clinicPayoutInRupees: Math.max(0, amount - adminCommissionInRupees)
  };
};
const isClinicDiamondPlanActive = (clinicRecord) => {
  const plan = String(clinicRecord?.currentPlan || '').trim().toLowerCase();
  const status = String(clinicRecord?.subscriptionStatus || '').trim().toLowerCase();
  const expiryTimestamp = clinicRecord?.planExpiresAt ? new Date(clinicRecord.planExpiresAt).getTime() : 0;
  return plan === 'diamond' && status === 'active' && expiryTimestamp > Date.now();
};
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

const mapActiveSlots = (slots) => {
  const now = new Date();
  return (Array.isArray(slots) ? slots : []).filter((slot) => !isSlotExpired(slot, now));
};

export const searchClinicsForPatients = async (req, res) => {
  try {
    const rawQuery = String(req.query?.q || req.query?.query || '').trim();
    const rawSpecialty = String(req.query?.specialty || '').trim();
    const queryTokens = rawQuery
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    const filters = {
      applicationStatus: { $ne: 'declined' },
      emailVerified: true
    };

    if (rawSpecialty) {
      const matchingClinicDoctors = await ClinicDoctor.find({
        specialization: {
          $regex: escapeRegex(rawSpecialty),
          $options: 'i'
        }
      })
        .select('clinicId')
        .lean();

      const specialtyClinicIds = Array.from(new Set(
        matchingClinicDoctors
          .map((doctor) => String(doctor?.clinicId || '').trim())
          .filter(Boolean)
      ));

      if (specialtyClinicIds.length === 0) {
        return res.status(200).json({ clinics: [] });
      }

      filters._id = {
        $in: specialtyClinicIds
      };
    }

    const clinics = await Clinic.find(filters)
      .select('name email phone address facilityType avatarDocument averageRating totalReviews applicationStatus emailVerified currentPlan subscriptionStatus planExpiresAt')
      .sort({ updatedAt: -1 })
      .limit(250)
      .lean();

    const filteredClinics = queryTokens.length === 0
      ? clinics
      : clinics.filter((clinic) => {
          const searchableText = [
            clinic.name,
            clinic.facilityType,
            clinic.address
          ]
            .join(' ')
            .toLowerCase();

          return queryTokens.some((token) => searchableText.includes(token));
        });

    const clinicIds = filteredClinics.map((clinic) => clinic?._id).filter(Boolean);
    const activeCampaigns = clinicIds.length > 0
      ? await CampaignPromotion.find({
          accountRole: 'clinic',
          clinicId: { $in: clinicIds },
          status: 'active',
          expiresAt: { $gt: new Date() }
        })
          .select('clinicId')
          .lean()
      : [];
    const campaignedClinicIdSet = new Set(activeCampaigns.map((promotion) => String(promotion?.clinicId || '').trim()));

    const mappedClinics = filteredClinics.map((clinic) => {
      const isDiamondPriority = isClinicDiamondPlanActive(clinic);
      const isSponsored = campaignedClinicIdSet.has(String(clinic?._id || '').trim());
      const rankingTier = isDiamondPriority ? 0 : isSponsored ? 1 : 2;

      return {
        ...(isDiamondPriority
          ? { isVerifiedBadge: true, hasPrioritySupport: true }
          : { isVerifiedBadge: false, hasPrioritySupport: false }),
        id: String(clinic._id),
        name: String(clinic.name || '').trim() || 'Clinic',
        specialty: String(clinic.facilityType || '').trim() || 'General Clinic',
        specialtyTag: 'Clinic',
        location: String(clinic.address || '').trim() || 'Location not provided',
        image: String(clinic.avatarDocument?.url || '').trim() || '/clinic-placeholder.svg',
        rating: Number(clinic.averageRating || 0).toFixed(2),
        reviews: `${Math.max(0, Math.trunc(Number(clinic.totalReviews || 0)))} reviews`,
        totalReviews: Math.max(0, Math.trunc(Number(clinic.totalReviews || 0))),
        isSponsored,
        isDiamondPriority,
        rankingTier,
        type: 'clinic'
      };
    });

    mappedClinics.sort((firstClinic, secondClinic) => {
      if ((firstClinic.rankingTier || 99) !== (secondClinic.rankingTier || 99)) {
        return (firstClinic.rankingTier || 99) - (secondClinic.rankingTier || 99);
      }

      const firstRating = Number(firstClinic.rating || 0);
      const secondRating = Number(secondClinic.rating || 0);
      if (secondRating !== firstRating) return secondRating - firstRating;

      return (Number(secondClinic.totalReviews || 0) - Number(firstClinic.totalReviews || 0));
    });

    return res.status(200).json({
      clinics: mappedClinics
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinics for search', error: error.message });
  }
};

export const getClinicDoctorsForPatient = async (req, res) => {
  try {
    const { clinicId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({ message: 'Invalid clinic id' });
    }

    const [clinic, doctors, services, mediaRecords] = await Promise.all([
      Clinic.findById(clinicId)
        .select('name email phone address facilityType about avatarDocument averageRating totalReviews profileCtr reviews createdAt applicationStatus emailVerified currentPlan subscriptionStatus planExpiresAt')
        .lean(),
      ClinicDoctor.find({ clinicId })
        .select('fullName specialization avatarDocument availabilitySlots')
        .lean(),
      ClinicService.find({ clinicId, isActive: true })
        .select('name serviceType availabilitySlots')
        .sort({ createdAt: -1 })
        .lean(),
      DoctorMedia.find({
        clinicId,
        uploaderRole: 'clinic',
        moderationStatus: 'approved',
        deletedAt: null
      })
        .select('mediaType asset createdAt')
        .sort({ createdAt: -1 })
        .limit(12)
        .lean()
    ]);

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const now = new Date();
    const expiredDoctorSlotUpdates = doctors.map((doctor) => {
      const expiredSlotIds = (Array.isArray(doctor?.availabilitySlots) ? doctor.availabilitySlots : [])
        .filter((slot) => isSlotExpired(slot, now))
        .map((slot) => slot?._id)
        .filter(Boolean);

      if (expiredSlotIds.length === 0) {
        return null;
      }

      return ClinicDoctor.updateOne(
        { _id: doctor._id, clinicId: clinic._id },
        { $pull: { availabilitySlots: { _id: { $in: expiredSlotIds } } } }
      );
    }).filter(Boolean);

    const expiredServiceSlotUpdates = services.map((service) => {
      const expiredSlotIds = (Array.isArray(service?.availabilitySlots) ? service.availabilitySlots : [])
        .filter((slot) => isSlotExpired(slot, now))
        .map((slot) => slot?._id)
        .filter(Boolean);

      if (expiredSlotIds.length === 0) {
        return null;
      }

      return ClinicService.updateOne(
        { _id: service._id, clinicId: clinic._id },
        { $pull: { availabilitySlots: { _id: { $in: expiredSlotIds } } } }
      );
    }).filter(Boolean);

    if (expiredDoctorSlotUpdates.length > 0 || expiredServiceSlotUpdates.length > 0) {
      await Promise.all([...expiredDoctorSlotUpdates, ...expiredServiceSlotUpdates]);
    }

    let profileCtr = Math.max(0, Math.trunc(Number(clinic.profileCtr || 0)));
    let patientId = req.user?.id || null;

    if (!patientId) {
      const authHeader = String(req.headers.authorization || '').trim();
      const [scheme, token] = authHeader.split(' ');
      if (scheme === 'Bearer' && token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
          if (decoded?.role === 'patient' && decoded?.id) {
            patientId = decoded.id;
          }
        } catch {
          patientId = null;
        }
      }
    }

    if (patientId) {
      const patient = await Patient.findById(patientId).select('_id').lean();
      if (patient) {
        const now = new Date();
        const visitUpdateResult = await ClinicProfileVisit.updateOne(
          { clinicId: clinic._id, patientId: patient._id },
          {
            $set: { lastVisitedAt: now },
            $setOnInsert: { clinicId: clinic._id, patientId: patient._id, firstVisitedAt: now }
          },
          { upsert: true }
        );

        const isUniqueVisit = Number(visitUpdateResult?.upsertedCount || 0) > 0;
        if (isUniqueVisit) {
          const ctrUpdateResult = await Clinic.findByIdAndUpdate(
            clinic._id,
            { $inc: { profileCtr: 1 } },
            { new: true }
          ).select('profileCtr').lean();
          profileCtr = Math.max(0, Math.trunc(Number(ctrUpdateResult?.profileCtr || (profileCtr + 1))));
        }
      }
    }

    return res.status(200).json({
      clinic: {
        ...(isClinicDiamondPlanActive(clinic)
          ? { isVerifiedBadge: true, hasPrioritySupport: true }
          : { isVerifiedBadge: false, hasPrioritySupport: false }),
        id: String(clinic._id),
        name: String(clinic.name || '').trim() || 'Clinic',
        email: String(clinic.email || '').trim(),
        phone: String(clinic.phone || '').trim(),
        facilityType: String(clinic.facilityType || '').trim() || 'General Clinic',
        address: String(clinic.address || '').trim() || 'Location not provided',
        image: String(clinic.avatarDocument?.url || '').trim() || '/clinic-placeholder.svg',
        rating: Number(clinic.averageRating || 0),
        totalReviews: Math.max(0, Math.trunc(Number(clinic.totalReviews || 0))),
        profileCtr,
        about: String(clinic.about || '').trim() || `${String(clinic.name || '').trim() || 'This clinic'} provides ${String(clinic.facilityType || '').trim() || 'general clinic'} services at ${String(clinic.address || '').trim() || 'its registered location'}.`
      },
      media: mediaRecords.map((record) => ({
        id: String(record?._id || ''),
        mediaType: String(record?.mediaType || '') === 'video' ? 'video' : 'image',
        url: String(record?.asset?.url || '').trim(),
        originalName: String(record?.asset?.originalName || '').trim() || 'Clinic media',
        createdAt: record?.createdAt || null
      })),
      reviews: (Array.isArray(clinic.reviews) ? clinic.reviews : [])
        .map((review) => ({
          id: String(review?._id || ''),
          patientName: String(review?.patientName || '').trim() || 'Patient',
          doctorName: String(review?.doctorName || '').trim(),
          rating: Math.max(1, Math.min(5, Math.trunc(Number(review?.rating || 0)) || 0)),
          comment: String(review?.comment || '').trim(),
          createdAt: review?.createdAt || null
        }))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
      doctors: doctors.map((doctor) => ({
        id: String(doctor._id),
        name: String(doctor.fullName || '').trim() || 'Doctor',
        specialty: String(doctor.specialization || '').trim() || 'Consultant',
        specialtyTag: 'Clinic Doctor',
        image: String(doctor.avatarDocument?.url || '').trim() || '/topdoc.svg',
        slots: mapActiveSlots(doctor.availabilitySlots)
      })),
      services: (Array.isArray(services) ? services : []).map((service) => ({
        id: String(service?._id || ''),
        name: String(service?.name || '').trim() || 'Clinic Service',
        serviceType: String(service?.serviceType || '').trim().toLowerCase() === 'facility' ? 'facility' : 'lab',
        slots: mapActiveSlots(service?.availabilitySlots)
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic doctors', error: error.message });
  }
};

export const createClinicDoctorAppointmentPaymentIntent = async (req, res) => {
  try {
    const {
      clinicId,
      doctorId,
      serviceId,
      slotId,
      phoneNumber,
      streetAddress,
      aptSuite = '',
      city,
      state,
      zip
    } = req.body || {};

    const hasDoctorId = mongoose.Types.ObjectId.isValid(doctorId);
    const hasServiceId = mongoose.Types.ObjectId.isValid(serviceId);

    if (!mongoose.Types.ObjectId.isValid(clinicId) || (!hasDoctorId && !hasServiceId)) {
      return res.status(400).json({ message: 'Valid clinic id and provider id are required' });
    }

    if (!slotId) {
      return res.status(400).json({ message: 'Appointment slot is required' });
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    const normalizedStreetAddress = normalizeAddressField(streetAddress);
    const normalizedAptSuite = normalizeAddressField(aptSuite);
    const normalizedCity = normalizeAddressField(city);
    const normalizedState = normalizeAddressField(state);
    const normalizedZip = normalizeAddressField(zip);

    if (!phoneNumberPattern.test(normalizedPhoneNumber)) {
      return res.status(400).json({ message: 'Phone number must contain only digits and be 7 to 15 digits long' });
    }

    if (!normalizedStreetAddress || !normalizedCity || !normalizedState || !normalizedZip) {
      return res.status(400).json({ message: 'Complete contact address details are required' });
    }

    const [patient, clinic] = await Promise.all([
      Patient.findById(req.user?.id).select('firstName lastName email').lean(),
      Clinic.findById(clinicId).select('name email').lean()
    ]);

    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });

    let providerType = 'doctor';
    let providerId = null;
    let providerName = '';
    let providerSpecialization = '';
    let providerAvatarUrl = '';
    let selectedSlot = null;

    if (hasDoctorId) {
      const doctor = await ClinicDoctor.findOne({ _id: doctorId, clinicId }).select('fullName specialization avatarDocument availabilitySlots').lean();
      if (!doctor) return res.status(404).json({ message: 'Selected doctor does not belong to this clinic' });
      selectedSlot = Array.isArray(doctor.availabilitySlots)
        ? doctor.availabilitySlots.find((slot) => String(slot?._id || slot?.id) === String(slotId))
        : null;
      providerType = 'doctor';
      providerId = doctor._id;
      providerName = String(doctor.fullName || '').trim();
      providerSpecialization = String(doctor.specialization || '').trim();
      providerAvatarUrl = String(doctor?.avatarDocument?.url || '').trim();
    } else {
      const service = await ClinicService.findOne({ _id: serviceId, clinicId, isActive: true }).select('name serviceType availabilitySlots').lean();
      if (!service) return res.status(404).json({ message: 'Selected clinic service is not available' });
      selectedSlot = Array.isArray(service.availabilitySlots)
        ? service.availabilitySlots.find((slot) => String(slot?._id || slot?.id) === String(slotId))
        : null;
      providerType = 'service';
      providerId = service._id;
      providerName = String(service.name || '').trim();
      providerSpecialization = String(service.serviceType || '').trim().toLowerCase() === 'facility' ? 'Facility Service' : 'Lab Service';
      providerAvatarUrl = '';
    }

    if (!selectedSlot) {
      return res.status(404).json({ message: 'Selected availability slot is no longer available' });
    }

    if (isSlotExpired(selectedSlot)) {
      return res.status(400).json({ message: 'Selected slot is in the past. Please choose a current or future slot.' });
    }

    const slotPriceInRupees = Math.max(0, Math.trunc(Number(selectedSlot?.priceInRupees || 0)));
    if (!slotPriceInRupees) {
      return res.status(400).json({ message: 'Selected slot has an invalid consultation fee' });
    }

    const existingConfirmedBooking = await ClinicDoctorAppointment.findOne({
      clinicId: clinic._id,
      ...(providerType === 'doctor' ? { doctorId: providerId } : { serviceId: providerId, providerType: 'service' }),
      slotId: String(selectedSlot._id),
      bookingStatus: 'confirmed'
    }).select('_id').lean();

    if (existingConfirmedBooking) {
      return res.status(409).json({ message: 'This slot has already been booked' });
    }

    const stripeClient = getStripeClient();
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: slotPriceInRupees * 100,
      currency: STRIPE_CURRENCY,
      payment_method_types: ['card'],
      metadata: {
        clinicId: String(clinic._id),
        providerType,
        doctorId: providerType === 'doctor' ? String(providerId) : '',
        serviceId: providerType === 'service' ? String(providerId) : '',
        patientId: String(patient._id),
        slotId: String(selectedSlot._id),
        appointmentType: providerType === 'service' ? 'clinic_service' : 'clinic_doctor'
      }
    });

    const {
      amountInRupees,
      adminCommissionInRupees,
      clinicPayoutInRupees
    } = getCommissionBreakdown(slotPriceInRupees);

    const patientName = getPatientDisplayName(patient);

    await ClinicDoctorAppointment.findOneAndUpdate(
      { paymentIntentId: paymentIntent.id },
      {
        clinicId: clinic._id,
        clinicName: String(clinic.name || '').trim(),
        clinicEmail: String(clinic.email || '').trim().toLowerCase(),
        doctorId: providerType === 'doctor' ? providerId : null,
        doctorName: providerName,
        doctorSpecialization: providerSpecialization,
        doctorAvatarUrl: providerAvatarUrl,
        providerType,
        serviceId: providerType === 'service' ? providerId : null,
        serviceName: providerType === 'service' ? providerName : '',
        serviceType: providerType === 'service' ? (providerSpecialization.toLowerCase().includes('facility') ? 'facility' : 'lab') : '',
        patientId: patient._id,
        patientName,
        patientEmail: String(patient.email || '').trim().toLowerCase(),
        patientPhone: normalizedPhoneNumber,
        contactAddress: {
          streetAddress: normalizedStreetAddress,
          aptSuite: normalizedAptSuite,
          city: normalizedCity,
          state: normalizedState,
          zip: normalizedZip
        },
        slotId: String(selectedSlot._id),
        appointmentDate: String(selectedSlot?.date || '').trim(),
        fromTime: String(selectedSlot?.fromTime || '').trim(),
        toTime: String(selectedSlot?.toTime || '').trim(),
        consultationMode: selectedSlot?.consultationMode || 'offline',
        amountInRupees,
        adminCommissionInRupees,
        clinicPayoutInRupees,
        currency: STRIPE_CURRENCY,
        paymentStatus: 'requires_payment',
        bookingStatus: 'pending'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amountInRupees,
      adminCommissionInRupees,
      clinicPayoutInRupees,
      currency: STRIPE_CURRENCY
    });
  } catch (error) {
    if (/stripe secret key is not configured/i.test(String(error?.message || ''))) {
      return res.status(500).json({ message: 'Stripe payment is not configured on server' });
    }

    return res.status(500).json({ message: 'Could not initialize clinic appointment payment', error: error.message });
  }
};

export const confirmClinicDoctorAppointmentPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body || {};

    if (!paymentIntentId) {
      return res.status(400).json({ message: 'Payment intent id is required' });
    }

    const appointment = await ClinicDoctorAppointment.findOne({
      paymentIntentId: String(paymentIntentId).trim(),
      patientId: req.user?.id
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Clinic appointment payment session not found' });
    }

    if (appointment.bookingStatus === 'confirmed' && appointment.paymentStatus === 'succeeded') {
      return res.status(200).json({ message: 'Appointment already confirmed' });
    }

    const stripeClient = getStripeClient();
    const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge']
    });

    if (String(paymentIntent?.metadata?.patientId || '') !== String(appointment.patientId || '')) {
      return res.status(403).json({ message: 'Payment does not belong to this patient session' });
    }

    if (paymentIntent.status !== 'succeeded') {
      appointment.paymentStatus = paymentIntent.status === 'canceled' ? 'canceled' : 'failed';
      await appointment.save();
      return res.status(400).json({ message: 'Payment is not completed yet' });
    }

    const amountReceivedInMinorUnits = Math.max(0, Math.trunc(Number(paymentIntent.amount_received || paymentIntent.amount || 0)));
    if (amountReceivedInMinorUnits < appointment.amountInRupees * 100) {
      appointment.paymentStatus = 'failed';
      await appointment.save();
      return res.status(400).json({ message: 'Payment amount verification failed' });
    }

    const isServiceAppointment = String(appointment?.providerType || '').trim().toLowerCase() === 'service' && appointment?.serviceId;

    const slotUpdateResult = isServiceAppointment
      ? await ClinicService.updateOne(
          {
            _id: appointment.serviceId,
            clinicId: appointment.clinicId,
            'availabilitySlots._id': appointment.slotId
          },
          {
            $pull: {
              availabilitySlots: {
                _id: appointment.slotId
              }
            }
          }
        )
      : await ClinicDoctor.updateOne(
          {
            _id: appointment.doctorId,
            clinicId: appointment.clinicId,
            'availabilitySlots._id': appointment.slotId
          },
          {
            $pull: {
              availabilitySlots: {
                _id: appointment.slotId
              }
            }
          }
        );

    if (slotUpdateResult.modifiedCount === 0) {
      appointment.bookingStatus = 'cancelled';
      appointment.paymentStatus = 'succeeded';
      await appointment.save();
      return res.status(409).json({ message: 'Selected slot is no longer available. Please contact support for refund assistance.' });
    }

    const cardDetails = paymentIntent?.latest_charge?.payment_method_details?.card || {};
    appointment.paymentStatus = 'succeeded';
    appointment.bookingStatus = 'confirmed';
    appointment.paymentMethodBrand = String(cardDetails.brand || '').trim();
    appointment.paymentMethodLast4 = String(cardDetails.last4 || '').trim();
    appointment.paidAt = new Date();
    await appointment.save();

    const emailPayload = {
      appointmentDate: appointment.appointmentDate,
      fromTime: appointment.fromTime,
      toTime: appointment.toTime,
      consultationMode: appointment.consultationMode,
      amountInRupees: appointment.amountInRupees
    };

    const emailOperations = [];

    if (appointment.patientEmail) {
      emailOperations.push(sendPatientClinicAppointmentBookedEmail({
        to: appointment.patientEmail,
        patientName: appointment.patientName,
        clinicName: appointment.clinicName,
        doctorName: appointment.doctorName,
        providerType: appointment.providerType,
        serviceType: appointment.serviceType,
        ...emailPayload
      }));
    }

    if (appointment.clinicEmail) {
      emailOperations.push(sendClinicAppointmentBookedEmail({
        to: appointment.clinicEmail,
        clinicName: appointment.clinicName,
        patientName: appointment.patientName,
        doctorName: appointment.doctorName,
        providerType: appointment.providerType,
        serviceType: appointment.serviceType,
        ...emailPayload
      }));
    }

    const emailResults = await Promise.allSettled(emailOperations);
    const failedEmailCount = emailResults.filter((result) => result.status === 'rejected').length;
    if (failedEmailCount > 0) {
      console.error('Clinic appointment booking emails failed to send', { paymentIntentId, failedEmailCount });
    }

    return res.status(200).json({
      message: 'Clinic appointment booked successfully',
      appointment: {
        id: String(appointment._id),
        date: appointment.appointmentDate,
        fromTime: appointment.fromTime,
        toTime: appointment.toTime,
        consultationMode: appointment.consultationMode,
        amountInRupees: appointment.amountInRupees,
        clinic: {
          id: String(appointment.clinicId),
          name: appointment.clinicName
        },
        doctor: {
          id: String(appointment.doctorId || appointment.serviceId || ''),
          name: appointment.doctorName,
          specialization: appointment.doctorSpecialization,
          avatarUrl: appointment.doctorAvatarUrl
        },
        providerType: String(appointment?.providerType || 'doctor').trim().toLowerCase() === 'service' ? 'service' : 'doctor'
      }
    });
  } catch (error) {
    if (/stripe secret key is not configured/i.test(String(error?.message || ''))) {
      return res.status(500).json({ message: 'Stripe payment is not configured on server' });
    }

    return res.status(500).json({ message: 'Could not confirm clinic appointment payment', error: error.message });
  }
};

export const bookClinicDoctorAppointment = async (req, res) => {
  try {
    const {
      clinicId,
      doctorId,
      serviceId,
      slotId,
      patientName
    } = req.body || {};

    const hasDoctorId = mongoose.Types.ObjectId.isValid(doctorId);
    const hasServiceId = mongoose.Types.ObjectId.isValid(serviceId);

    if (!mongoose.Types.ObjectId.isValid(clinicId) || (!hasDoctorId && !hasServiceId)) {
      return res.status(400).json({ message: 'Valid clinic id and provider id are required' });
    }

    const clinic = await Clinic.findById(clinicId).select('name email').lean();
    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    let providerType = 'doctor';
    let providerId = null;
    let providerName = '';
    let providerSpecialization = '';
    let providerAvatarUrl = '';
    let provider = null;
    let slot = null;

    if (hasDoctorId) {
      provider = await ClinicDoctor.findOne({ _id: doctorId, clinicId: clinic._id });
      if (!provider) return res.status(404).json({ message: 'Selected doctor does not belong to this clinic' });
      slot = provider.availabilitySlots.find((s) => String(s._id || s.id) === String(slotId));
      providerType = 'doctor';
      providerId = provider._id;
      providerName = String(provider.fullName || '').trim();
      providerSpecialization = String(provider.specialization || '').trim();
      providerAvatarUrl = String(provider?.avatarDocument?.url || '').trim();
    } else {
      provider = await ClinicService.findOne({ _id: serviceId, clinicId: clinic._id, isActive: true });
      if (!provider) return res.status(404).json({ message: 'Selected clinic service is not available' });
      slot = provider.availabilitySlots.find((s) => String(s._id || s.id) === String(slotId));
      providerType = 'service';
      providerId = provider._id;
      providerName = String(provider.name || '').trim();
      providerSpecialization = String(provider.serviceType || '').trim().toLowerCase() === 'facility' ? 'Facility Service' : 'Lab Service';
      providerAvatarUrl = '';
    }

    if (!slot) return res.status(404).json({ message: 'Selected availability slot not found' });
    if (isSlotExpired(slot)) {
      return res.status(400).json({ message: 'Selected slot is in the past. Please choose a current or future slot.' });
    }

    const patient = await Patient.findById(req.user?.id).select('firstName lastName phone email').lean();
    let computedPatientName = 'Patient Name Not Set';
    let computedPatientPhone = '';

    if (patient) {
      computedPatientName = `${String(patient.firstName || '').trim()} ${String(patient.lastName || '').trim()}`.trim() || 'Patient';
      computedPatientPhone = String(patient.phone || '').trim();
    }

    // Create the appointment using ClinicDoctorAppointment model
    const createdAppointment = await ClinicDoctorAppointment.create({
      clinicId: clinic._id,
      clinicName: String(clinic.name || '').trim(),
      clinicEmail: String(clinic.email || '').trim().toLowerCase(),
      doctorId: providerType === 'doctor' ? providerId : null,
      doctorName: providerName,
      doctorSpecialization: providerSpecialization,
      doctorAvatarUrl: providerAvatarUrl,
      providerType,
      serviceId: providerType === 'service' ? providerId : null,
      serviceName: providerType === 'service' ? providerName : '',
      serviceType: providerType === 'service' ? (providerSpecialization.toLowerCase().includes('facility') ? 'facility' : 'lab') : '',
      patientId: patient?._id || null,
      patientName: computedPatientName,
      patientPhone: computedPatientPhone,
      appointmentDate: slot.date,
      fromTime: slot.fromTime,
      toTime: slot.toTime,
      consultationMode: slot.consultationMode || 'offline',
      bookingStatus: 'confirmed',
      paymentStatus: 'succeeded',
      paidAt: new Date(),
      amountInRupees: Math.max(0, Math.trunc(Number(slot.priceInRupees || 0)))
    });

    // Remove the booked slot from availabilitySlots
    provider.availabilitySlots = provider.availabilitySlots.filter((s) => String(s._id || s.id) !== String(slotId));
    await provider.save();

    // Send emails (Patient & Clinic)
    try {
      if (patient && patient.email) {
        await sendPatientClinicAppointmentBookedEmail({
          to: patient.email,
          patientName: computedPatientName,
          clinicName: String(clinic.name || '').trim(),
          doctorName: providerName,
          providerType,
          serviceType: providerType === 'service'
            ? (providerSpecialization.toLowerCase().includes('facility') ? 'facility' : 'lab')
            : '',
          appointmentDate: createdAppointment.appointmentDate,
          fromTime: createdAppointment.fromTime,
          toTime: createdAppointment.toTime,
          consultationMode: createdAppointment.consultationMode,
          amountInRupees: slot.priceInRupees || 0
        });
      }

      if (clinic && clinic.email) {
        await sendClinicAppointmentBookedEmail({
          to: clinic.email,
          clinicName: String(clinic.name || '').trim(),
          patientName: computedPatientName,
          doctorName: providerName,
          providerType,
          serviceType: providerType === 'service'
            ? (providerSpecialization.toLowerCase().includes('facility') ? 'facility' : 'lab')
            : '',
          appointmentDate: createdAppointment.appointmentDate,
          fromTime: createdAppointment.fromTime,
          toTime: createdAppointment.toTime,
          consultationMode: createdAppointment.consultationMode,
          amountInRupees: slot.priceInRupees || 0
        });
      }
    } catch (err) {
      // Ignore mail errors so the booking remains successful
    }

    return res.status(201).json({
      message: 'Appointment booked successfully',
      appointment: {
        id: String(createdAppointment._id),
        date: createdAppointment.appointmentDate,
        fromTime: createdAppointment.fromTime,
        toTime: createdAppointment.toTime,
        consultationMode: createdAppointment.consultationMode,
        doctor: {
          id: String(providerId || ''),
          name: providerName,
          specialization: providerSpecialization
        },
        providerType
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not schedule clinic appointment', error: error.message });
  }
};
