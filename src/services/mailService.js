import nodemailer from 'nodemailer';

let transporter;

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
};

const ensureSmtpCredentials = () => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials are missing in environment variables.');
  }
};

const formatCurrencyInRupees = (amountInRupees) => {
  const parsedAmount = Number(amountInRupees);
  const safeAmount = Number.isFinite(parsedAmount)
    ? Math.max(0, Math.trunc(parsedAmount))
    : 0;

  return `Rs ${safeAmount.toLocaleString('en-PK')}`;
};

const formatAddressBlock = (address = {}) => {
  const lineParts = [
    String(address?.streetAddress || '').trim(),
    String(address?.aptSuite || '').trim(),
    String(address?.city || '').trim(),
    String(address?.state || '').trim(),
    String(address?.zip || '').trim()
  ].filter(Boolean);

  return lineParts.join(', ');
};

export const sendVerificationOtpEmail = async ({ to, firstName, otp }) => {
  ensureSmtpCredentials();

  const emailTitle = 'Your verification code';
  const greetingName = firstName || 'there';

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: emailTitle,
    text: `Hi ${greetingName}, your verification code is ${otp}. This code will expire in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Email Verification</h2>
        <p style="margin: 0 0 16px;">Hi ${greetingName},</p>
        <p style="margin: 0 0 16px;">Use this OTP to verify your account:</p>
        <div style="display: inline-block; font-size: 28px; letter-spacing: 8px; font-weight: 700; background: #f3f4f6; padding: 12px 20px; border-radius: 8px;">
          ${otp}
        </div>
        <p style="margin: 16px 0 0;">This OTP expires in <strong>10 minutes</strong>.</p>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendDoctorApplicationStatusEmail = async ({
  to,
  fullName,
  status
}) => {
  ensureSmtpCredentials();

  const safeStatus = status === 'approved' ? 'approved' : 'declined';
  const isApproved = safeStatus === 'approved';
  const subject = isApproved
    ? 'Your doctor application has been approved'
    : 'Your doctor application status update';

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: `Hi ${fullName}, your doctor application has been ${safeStatus}.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Doctor Application Update</h2>
        <p style="margin: 0 0 16px;">Hi ${fullName},</p>
        <p style="margin: 0 0 16px;">
          Your doctor application has been
          <strong style="color: ${isApproved ? '#15803d' : '#b91c1c'};"> ${safeStatus.toUpperCase()}</strong>.
        </p>
        <p style="margin: 0;">Thank you for using our platform.</p>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendClinicApplicationStatusEmail = async ({
  to,
  clinicName,
  status
}) => {
  ensureSmtpCredentials();

  const safeStatus = status === 'approved' ? 'approved' : 'declined';
  const isApproved = safeStatus === 'approved';
  const subject = isApproved
    ? 'Your clinic application has been approved'
    : 'Your clinic application status update';

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: `Hi ${clinicName}, your clinic application has been ${safeStatus}.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Clinic Application Update</h2>
        <p style="margin: 0 0 16px;">Hi ${clinicName},</p>
        <p style="margin: 0 0 16px;">
          Your clinic application has been
          <strong style="color: ${isApproved ? '#15803d' : '#b91c1c'};"> ${safeStatus.toUpperCase()}</strong>.
        </p>
        <p style="margin: 0;">Thank you for using our platform.</p>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendMedicalStoreApplicationStatusEmail = async ({
  to,
  storeName,
  status
}) => {
  ensureSmtpCredentials();

  const safeStatus = status === 'approved' ? 'approved' : 'declined';
  const isApproved = safeStatus === 'approved';
  const subject = isApproved
    ? 'Your medical store application has been approved'
    : 'Your medical store application status update';

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: `Hi ${storeName}, your medical store application has been ${safeStatus}.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Medical Store Application Update</h2>
        <p style="margin: 0 0 16px;">Hi ${storeName},</p>
        <p style="margin: 0 0 16px;">
          Your medical store application has been
          <strong style="color: ${isApproved ? '#15803d' : '#b91c1c'};"> ${safeStatus.toUpperCase()}</strong>.
        </p>
        <p style="margin: 0;">Thank you for using our platform.</p>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendPatientAppointmentConfirmationEmail = async ({
  to,
  patientName,
  doctorName,
  appointmentDate,
  fromTime,
  toTime,
  consultationMode,
  amountInRupees,
  contactPhoneNumber,
  contactAddress,
  paymentMethodBrand,
  paymentMethodLast4
}) => {
  ensureSmtpCredentials();

  const safePatientName = String(patientName || '').trim() || 'Patient';
  const safeDoctorName = String(doctorName || '').trim() || 'Doctor';
  const modeLabel = consultationMode === 'offline' ? 'Offline (Clinic Visit)' : 'Online Consultation';
  const paymentMethodLabel = [
    String(paymentMethodBrand || '').trim(),
    String(paymentMethodLast4 || '').trim() ? `**** ${String(paymentMethodLast4 || '').trim()}` : ''
  ]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Card';
  const addressText = formatAddressBlock(contactAddress) || 'Not provided';
  const amountText = formatCurrencyInRupees(amountInRupees);

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Appointment Confirmed',
    text: [
      `Hi ${safePatientName},`,
      '',
      `Your appointment with ${safeDoctorName} is confirmed.`,
      `Date: ${appointmentDate}`,
      `Time: ${fromTime} - ${toTime}`,
      `Mode: ${modeLabel}`,
      `Amount Paid: ${amountText}`,
      `Payment Method: ${paymentMethodLabel}`,
      `Contact Phone: ${contactPhoneNumber}`,
      `Contact Address: ${addressText}`
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Appointment Confirmed</h2>
        <p style="margin: 0 0 16px;">Hi ${safePatientName},</p>
        <p style="margin: 0 0 16px;">Your appointment with <strong>${safeDoctorName}</strong> has been confirmed.</p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px;">
          <p style="margin: 0 0 8px;"><strong>Date:</strong> ${appointmentDate}</p>
          <p style="margin: 0 0 8px;"><strong>Time:</strong> ${fromTime} - ${toTime}</p>
          <p style="margin: 0 0 8px;"><strong>Mode:</strong> ${modeLabel}</p>
          <p style="margin: 0 0 8px;"><strong>Amount Paid:</strong> ${amountText}</p>
          <p style="margin: 0;"><strong>Payment Method:</strong> ${paymentMethodLabel}</p>
        </div>

        <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 14px 16px;">
          <p style="margin: 0 0 8px;"><strong>Contact Phone:</strong> ${contactPhoneNumber}</p>
          <p style="margin: 0;"><strong>Contact Address:</strong> ${addressText}</p>
        </div>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendDoctorAppointmentBookedEmail = async ({
  to,
  doctorName,
  patientName,
  patientEmail,
  appointmentDate,
  fromTime,
  toTime,
  consultationMode,
  amountInRupees,
  patientPhoneNumber,
  patientAddress
}) => {
  ensureSmtpCredentials();

  const safeDoctorName = String(doctorName || '').trim() || 'Doctor';
  const safePatientName = String(patientName || '').trim() || 'Patient';
  const safePatientEmail = String(patientEmail || '').trim() || 'Not provided';
  const modeLabel = consultationMode === 'offline' ? 'Offline (Clinic Visit)' : 'Online Consultation';
  const amountText = formatCurrencyInRupees(amountInRupees);
  const addressText = formatAddressBlock(patientAddress) || 'Not provided';

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'New Appointment Booked',
    text: [
      `Hi ${safeDoctorName},`,
      '',
      `A new appointment has been booked by ${safePatientName}.`,
      `Date: ${appointmentDate}`,
      `Time: ${fromTime} - ${toTime}`,
      `Mode: ${modeLabel}`,
      `Slot Price: ${amountText}`,
      `Patient Name: ${safePatientName}`,
      `Patient Email: ${safePatientEmail}`,
      `Patient Phone: ${patientPhoneNumber}`,
      `Patient Address: ${addressText}`
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">New Appointment Booked</h2>
        <p style="margin: 0 0 16px;">Hi ${safeDoctorName},</p>
        <p style="margin: 0 0 16px;">A new appointment has been booked by <strong>${safePatientName}</strong>.</p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px;">
          <p style="margin: 0 0 8px;"><strong>Date:</strong> ${appointmentDate}</p>
          <p style="margin: 0 0 8px;"><strong>Time:</strong> ${fromTime} - ${toTime}</p>
          <p style="margin: 0 0 8px;"><strong>Mode:</strong> ${modeLabel}</p>
          <p style="margin: 0;"><strong>Slot Price:</strong> ${amountText}</p>
        </div>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 16px;">
          <p style="margin: 0 0 8px;"><strong>Patient Name:</strong> ${safePatientName}</p>
          <p style="margin: 0 0 8px;"><strong>Patient Email:</strong> ${safePatientEmail}</p>
          <p style="margin: 0 0 8px;"><strong>Patient Phone:</strong> ${patientPhoneNumber}</p>
          <p style="margin: 0;"><strong>Patient Address:</strong> ${addressText}</p>
        </div>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendPatientAppointmentCancelledEmail = async ({
  to,
  patientName,
  doctorName,
  appointmentDate,
  fromTime,
  toTime,
  consultationMode,
  amountInRupees
}) => {
  ensureSmtpCredentials();

  const safePatientName = String(patientName || '').trim() || 'Patient';
  const safeDoctorName = String(doctorName || '').trim() || 'Doctor';
  const modeLabel = consultationMode === 'offline' ? 'Offline (Clinic Visit)' : 'Online Consultation';
  const amountText = formatCurrencyInRupees(amountInRupees);

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Appointment Cancelled',
    text: [
      `Hi ${safePatientName},`,
      '',
      `Your appointment with ${safeDoctorName} has been cancelled.`,
      `Date: ${appointmentDate}`,
      `Time: ${fromTime} - ${toTime}`,
      `Mode: ${modeLabel}`,
      `Paid Amount: ${amountText}`,
      'No refund will be processed for this cancellation.'
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Appointment Cancelled</h2>
        <p style="margin: 0 0 16px;">Hi ${safePatientName},</p>
        <p style="margin: 0 0 16px;">Your appointment with <strong>${safeDoctorName}</strong> has been cancelled.</p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px;">
          <p style="margin: 0 0 8px;"><strong>Date:</strong> ${appointmentDate}</p>
          <p style="margin: 0 0 8px;"><strong>Time:</strong> ${fromTime} - ${toTime}</p>
          <p style="margin: 0 0 8px;"><strong>Mode:</strong> ${modeLabel}</p>
          <p style="margin: 0;"><strong>Paid Amount:</strong> ${amountText}</p>
        </div>

        <p style="margin: 0; color: #b91c1c;"><strong>No refund will be processed for this cancellation.</strong></p>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendDoctorAppointmentCancelledEmail = async ({
  to,
  doctorName,
  patientName,
  patientEmail,
  appointmentDate,
  fromTime,
  toTime,
  consultationMode,
  amountInRupees
}) => {
  ensureSmtpCredentials();

  const safeDoctorName = String(doctorName || '').trim() || 'Doctor';
  const safePatientName = String(patientName || '').trim() || 'Patient';
  const safePatientEmail = String(patientEmail || '').trim() || 'Not provided';
  const modeLabel = consultationMode === 'offline' ? 'Offline (Clinic Visit)' : 'Online Consultation';
  const amountText = formatCurrencyInRupees(amountInRupees);

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Appointment Cancellation Notice',
    text: [
      `Hi ${safeDoctorName},`,
      '',
      `An appointment with ${safePatientName} has been cancelled.`,
      `Date: ${appointmentDate}`,
      `Time: ${fromTime} - ${toTime}`,
      `Mode: ${modeLabel}`,
      `Slot Price: ${amountText}`,
      `Patient Name: ${safePatientName}`,
      `Patient Email: ${safePatientEmail}`,
      'No refund was processed for this cancellation.'
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Appointment Cancellation Notice</h2>
        <p style="margin: 0 0 16px;">Hi ${safeDoctorName},</p>
        <p style="margin: 0 0 16px;">An appointment with <strong>${safePatientName}</strong> has been cancelled.</p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px;">
          <p style="margin: 0 0 8px;"><strong>Date:</strong> ${appointmentDate}</p>
          <p style="margin: 0 0 8px;"><strong>Time:</strong> ${fromTime} - ${toTime}</p>
          <p style="margin: 0 0 8px;"><strong>Mode:</strong> ${modeLabel}</p>
          <p style="margin: 0;"><strong>Slot Price:</strong> ${amountText}</p>
        </div>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 16px;">
          <p style="margin: 0 0 8px;"><strong>Patient Name:</strong> ${safePatientName}</p>
          <p style="margin: 0;"><strong>Patient Email:</strong> ${safePatientEmail}</p>
        </div>

        <p style="margin: 14px 0 0; color: #b91c1c;"><strong>No refund was processed for this cancellation.</strong></p>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};
