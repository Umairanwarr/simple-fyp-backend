import mongoose from 'mongoose';
import { Clinic } from '../../../models/Clinic.js';
import { ClinicDoctor } from '../../../models/ClinicDoctor.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';
import { Patient } from '../../../models/Patient.js';
import {
  sendPatientClinicAppointmentBookedEmail,
  sendClinicAppointmentBookedEmail
} from '../../../services/mailService.js';

export const searchClinicsForPatients = async (req, res) => {
  try {
    const rawQuery = String(req.query?.q || req.query?.query || '').trim();
    const queryTokens = rawQuery
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    const filters = {
      applicationStatus: { $ne: 'declined' },
      emailVerified: true
    };

    const clinics = await Clinic.find(filters)
      .select('name email phone address facilityType avatarDocument')
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

    return res.status(200).json({
      clinics: filteredClinics.map((clinic) => ({
        id: String(clinic._id),
        name: String(clinic.name || '').trim() || 'Clinic',
        specialty: String(clinic.facilityType || '').trim() || 'General Clinic',
        specialtyTag: 'Clinic',
        location: String(clinic.address || '').trim() || 'Location not provided',
        image: String(clinic.avatarDocument?.url || '').trim() || '/clinic-placeholder.svg',
        type: 'clinic'
      }))
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

    const doctors = await ClinicDoctor.find({ clinicId })
      .select('fullName specialization avatarDocument availabilitySlots')
      .lean();

    return res.status(200).json({
      doctors: doctors.map((doctor) => ({
        id: String(doctor._id),
        name: String(doctor.fullName || '').trim() || 'Doctor',
        specialty: String(doctor.specialization || '').trim() || 'Consultant',
        specialtyTag: 'Clinic Doctor',
        image: String(doctor.avatarDocument?.url || '').trim() || '/topdoc.svg',
        slots: doctor.availabilitySlots || []
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic doctors', error: error.message });
  }
};

export const bookClinicDoctorAppointment = async (req, res) => {
  try {
    const {
      clinicId,
      doctorId,
      slotId,
      patientName,
      patientPhone
    } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(clinicId) || !mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Valid clinic id and doctor id are required' });
    }

    const clinic = await Clinic.findById(clinicId).select('name email').lean();
    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const doctor = await ClinicDoctor.findOne({ _id: doctorId, clinicId: clinic._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Selected doctor does not belong to this clinic' });
    }

    const slot = doctor.availabilitySlots.find((s) => String(s._id || s.id) === String(slotId));
    if (!slot) {
      return res.status(404).json({ message: 'Selected availability slot not found' });
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
      doctorId: doctor._id,
      doctorName: String(doctor.fullName || '').trim(),
      doctorSpecialization: String(doctor.specialization || '').trim(),
      doctorAvatarUrl: String(doctor?.avatarDocument?.url || '').trim(),
      patientId: patient?._id || null,
      patientName: computedPatientName,
      patientPhone: computedPatientPhone,
      appointmentDate: slot.date,
      fromTime: slot.fromTime,
      toTime: slot.toTime,
      consultationMode: slot.consultationMode || 'offline',
      bookingStatus: 'confirmed'
    });

    // Remove the booked slot from availabilitySlots
    doctor.availabilitySlots = doctor.availabilitySlots.filter((s) => String(s._id || s.id) !== String(slotId));
    await doctor.save();

    // Send emails (Patient & Clinic)
    try {
      if (patient && patient.email) {
        await sendPatientClinicAppointmentBookedEmail({
          to: patient.email,
          patientName: computedPatientName,
          clinicName: String(clinic.name || '').trim(),
          doctorName: String(doctor.fullName || '').trim(),
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
          doctorName: String(doctor.fullName || '').trim(),
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
          id: String(doctor._id),
          name: doctor.fullName,
          specialization: doctor.specialization
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not schedule clinic appointment', error: error.message });
  }
};
