import { Clinic } from '../../../models/Clinic.js';
import { ClinicDoctor } from '../../../models/ClinicDoctor.js';
import { ClinicDoctorAppointment } from '../../../models/ClinicDoctorAppointment.js';
import { deleteFromCloudinary, uploadUserAvatarToCloudinary } from '../../../services/cloudinaryService.js';
import {
  getClinicAppointmentLifecycleStatus,
  parseClinicAppointmentDateTime
} from './appointmentShared.js';

const getAppointmentStartSortTimestamp = (appointmentRecord) => {
  const appointmentStart = parseClinicAppointmentDateTime({
    date: appointmentRecord?.appointmentDate,
    time: appointmentRecord?.fromTime
  });

  if (!appointmentStart) {
    return 0;
  }

  return appointmentStart.getTime();
};

const buildDoctorAppointmentStatsMap = (appointments, now = new Date()) => {
  const statsMap = new Map();

  (Array.isArray(appointments) ? appointments : []).forEach((appointmentRecord) => {
    const doctorId = String(appointmentRecord?.doctorId || '').trim();

    if (!doctorId) {
      return;
    }

    if (!statsMap.has(doctorId)) {
      statsMap.set(doctorId, {
        totalAppointments: 0,
        upcomingAppointments: 0,
        ongoingAppointments: 0,
        cancelledAppointments: 0,
        nextAppointment: null,
        _nextAppointmentTimestamp: Number.POSITIVE_INFINITY
      });
    }

    const statsRecord = statsMap.get(doctorId);
    statsRecord.totalAppointments += 1;

    const lifecycleStatus = getClinicAppointmentLifecycleStatus(appointmentRecord, now);

    if (lifecycleStatus === 'cancelled') {
      statsRecord.cancelledAppointments += 1;
      return;
    }

    if (lifecycleStatus === 'ongoing') {
      statsRecord.ongoingAppointments += 1;
      return;
    }

    if (lifecycleStatus === 'upcoming') {
      statsRecord.upcomingAppointments += 1;

      const appointmentStartTimestamp = getAppointmentStartSortTimestamp(appointmentRecord);

      if (appointmentStartTimestamp > 0 && appointmentStartTimestamp < statsRecord._nextAppointmentTimestamp) {
        statsRecord._nextAppointmentTimestamp = appointmentStartTimestamp;
        statsRecord.nextAppointment = {
          date: String(appointmentRecord?.appointmentDate || '').trim(),
          fromTime: String(appointmentRecord?.fromTime || '').trim(),
          toTime: String(appointmentRecord?.toTime || '').trim()
        };
      }
    }
  });

  const normalizedStatsMap = new Map();

  statsMap.forEach((statsRecord, doctorId) => {
    const {
      _nextAppointmentTimestamp,
      ...payload
    } = statsRecord;

    normalizedStatsMap.set(doctorId, payload);
  });

  return normalizedStatsMap;
};

const mapClinicDoctorPayload = (doctorRecord, appointmentStats = null) => {
  return {
    id: String(doctorRecord?._id || ''),
    fullName: String(doctorRecord?.fullName || '').trim(),
    specialization: String(doctorRecord?.specialization || '').trim(),
    avatarUrl: String(doctorRecord?.avatarDocument?.url || '').trim(),
    createdAt: doctorRecord?.createdAt || null,
    appointmentStats: {
      totalAppointments: Math.max(0, Math.trunc(Number(appointmentStats?.totalAppointments || 0))),
      upcomingAppointments: Math.max(0, Math.trunc(Number(appointmentStats?.upcomingAppointments || 0))),
      ongoingAppointments: Math.max(0, Math.trunc(Number(appointmentStats?.ongoingAppointments || 0))),
      cancelledAppointments: Math.max(0, Math.trunc(Number(appointmentStats?.cancelledAppointments || 0))),
      nextAppointment: appointmentStats?.nextAppointment || null
    }
  };
};

export const getClinicDoctors = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id).select('name email').lean();

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const doctors = await ClinicDoctor.find({ clinicId: clinic._id })
      .sort({ createdAt: -1 })
      .lean();

    const doctorIds = doctors
      .map((doctorRecord) => doctorRecord?._id)
      .filter(Boolean);

    const appointments = doctorIds.length > 0
      ? await ClinicDoctorAppointment.find({
          clinicId: clinic._id,
          doctorId: {
            $in: doctorIds
          }
        })
          .select('doctorId appointmentDate fromTime toTime bookingStatus')
          .lean()
      : [];

    const doctorAppointmentStatsMap = buildDoctorAppointmentStatsMap(appointments);

    return res.status(200).json({
      doctors: doctors.map((doctorRecord) => {
        const doctorId = String(doctorRecord?._id || '').trim();
        return mapClinicDoctorPayload(doctorRecord, doctorAppointmentStatsMap.get(doctorId));
      })
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic doctors', error: error.message });
  }
};

export const registerClinicDoctor = async (req, res) => {
  let uploadedAvatar = null;

  try {
    const fullName = String(req.body?.fullName || req.body?.name || '').trim();
    const specialization = String(req.body?.specialization || '').trim();

    if (!fullName || !specialization) {
      return res.status(400).json({ message: 'Doctor name and specialization are required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Doctor avatar image file is required' });
    }

    const clinic = await Clinic.findById(req.user?.id).select('name email');

    if (!clinic) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    uploadedAvatar = await uploadUserAvatarToCloudinary(req.file, 'clinic-doctors');

    const doctor = await ClinicDoctor.create({
      clinicId: clinic._id,
      clinicName: String(clinic.name || '').trim(),
      clinicEmail: String(clinic.email || '').trim().toLowerCase(),
      fullName,
      specialization,
      avatarDocument: uploadedAvatar
    });

    return res.status(201).json({
      message: 'Doctor registered successfully',
      doctor: mapClinicDoctorPayload(doctor, null)
    });
  } catch (error) {
    if (uploadedAvatar?.publicId) {
      await deleteFromCloudinary(uploadedAvatar.publicId, uploadedAvatar.resourceType || 'image').catch(() => {});
    }

    return res.status(500).json({ message: 'Could not register clinic doctor', error: error.message });
  }
};
