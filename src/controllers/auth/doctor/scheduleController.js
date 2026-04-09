import {
  Appointment,
  Doctor,
  isValidCalendarDate,
  mapDoctorScheduleRecord
} from './shared.js';

export const getDoctorSchedule = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id)
      .select('_id')
      .lean();

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const fromDate = String(req.query?.fromDate || '').trim();
    const toDate = String(req.query?.toDate || '').trim();

    if (fromDate && !isValidCalendarDate(fromDate)) {
      return res.status(400).json({ message: 'fromDate must be in YYYY-MM-DD format' });
    }

    if (toDate && !isValidCalendarDate(toDate)) {
      return res.status(400).json({ message: 'toDate must be in YYYY-MM-DD format' });
    }

    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ message: 'fromDate must be earlier than or equal to toDate' });
    }

    const appointmentFilters = {
      doctorId: req.user?.id,
      paymentStatus: 'succeeded',
      bookingStatus: {
        $in: ['confirmed', 'cancelled']
      }
    };

    if (fromDate || toDate) {
      appointmentFilters.appointmentDate = {};

      if (fromDate) {
        appointmentFilters.appointmentDate.$gte = fromDate;
      }

      if (toDate) {
        appointmentFilters.appointmentDate.$lte = toDate;
      }
    }

    const appointments = await Appointment.find(appointmentFilters)
      .select(
        'patientName patientEmail contactPhoneNumber appointmentDate fromTime toTime consultationMode bookingStatus amountInRupees paidAt cancelledAt createdAt updatedAt'
      )
      .sort({ appointmentDate: 1, fromTime: 1, updatedAt: -1, createdAt: -1 })
      .lean();

    return res.status(200).json({
      appointments: appointments.map((appointment) => mapDoctorScheduleRecord(appointment))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch doctor schedule', error: error.message });
  }
};
