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

const formatDateLabel = (dateValue) => {
  if (!dateValue) {
    return 'N/A';
  }

  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'N/A';
  }

  return parsedDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export const sendDoctorSubscriptionLifecycleEmail = async ({
  to,
  doctorName,
  eventType,
  planName,
  amountInRupees = 0,
  expiresAt = null
}) => {
  ensureSmtpCredentials();

  const safeDoctorName = String(doctorName || '').trim() || 'Doctor';
  const safePlanName = String(planName || '').trim() || 'Plan';
  const safeEventType = String(eventType || '').trim().toLowerCase();
  const expiresAtLabel = formatDateLabel(expiresAt);
  const amountLabel = formatCurrencyInRupees(amountInRupees);

  let subject = 'Subscription Update';
  let summary = `Your ${safePlanName} subscription has been updated.`;

  if (safeEventType === 'plan_bought') {
    subject = `${safePlanName} Plan Activated`;
    summary = `Your ${safePlanName} subscription has been activated successfully.`;
  } else if (safeEventType === 'plan_renewed') {
    subject = `${safePlanName} Plan Renewed`;
    summary = `Your ${safePlanName} subscription has been renewed successfully.`;
  } else if (safeEventType === 'plan_updated') {
    subject = `Plan Updated To ${safePlanName}`;
    summary = `Your subscription has been updated to ${safePlanName}.`;
  } else if (safeEventType === 'plan_cancelled') {
    subject = `${safePlanName} Plan Cancelled`;
    summary = `Your ${safePlanName} subscription has been cancelled and your account is now on Platinum.`;
  } else if (safeEventType === 'plan_expired') {
    subject = `${safePlanName} Plan Expired`;
    summary = `Your ${safePlanName} subscription expired and your account is now on Platinum.`;
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: [
      `Hi ${safeDoctorName},`,
      '',
      summary,
      `Plan: ${safePlanName}`,
      `Amount: ${amountLabel}`,
      `Expires On: ${expiresAtLabel}`
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">${subject}</h2>
        <p style="margin: 0 0 16px;">Hi ${safeDoctorName},</p>
        <p style="margin: 0 0 16px;">${summary}</p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px;">
          <p style="margin: 0 0 8px;"><strong>Plan:</strong> ${safePlanName}</p>
          <p style="margin: 0 0 8px;"><strong>Amount:</strong> ${amountLabel}</p>
          <p style="margin: 0;"><strong>Expires On:</strong> ${expiresAtLabel}</p>
        </div>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
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
      'Refund Policy: Cancel within 15 minutes of booking to receive a full refund.',
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
          <p style="margin: 0 0 8px;"><strong>Refund Policy:</strong> Cancel within 15 minutes of booking to receive a full refund.</p>
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
  amountInRupees,
  cancelledByRole = '',
  refundStatus = 'not_applicable',
  refundAmountInRupees = 0
}) => {
  ensureSmtpCredentials();

  const safePatientName = String(patientName || '').trim() || 'Patient';
  const safeDoctorName = String(doctorName || '').trim() || 'Doctor';
  const safeCancelledByRole = String(cancelledByRole || '').trim().toLowerCase();
  const safeRefundStatus = String(refundStatus || '').trim().toLowerCase();
  const safeRefundAmountInRupees = Math.max(0, Math.trunc(Number(refundAmountInRupees || 0)));
  const modeLabel = consultationMode === 'offline' ? 'Offline (Clinic Visit)' : 'Online Consultation';
  const amountText = formatCurrencyInRupees(amountInRupees);

  let cancellationSummaryText = `Your appointment with ${safeDoctorName} has been cancelled.`;
  let refundPolicyText = 'No refund will be processed for this cancellation.';
  let refundPolicyHtml = '<strong>No refund will be processed for this cancellation.</strong>';

  if (safeCancelledByRole === 'doctor') {
    cancellationSummaryText = `Your appointment with ${safeDoctorName} has been cancelled by your doctor.`;

    if (safeRefundStatus === 'succeeded' && safeRefundAmountInRupees > 0) {
      const refundAmountText = formatCurrencyInRupees(safeRefundAmountInRupees);
      refundPolicyText = `Refund of ${refundAmountText} has been processed to your payment method. Admin commission is retained.`;
      refundPolicyHtml = `<strong style="color: #047857;">Refund of ${refundAmountText} has been processed to your payment method. Admin commission is retained.</strong>`;
    } else if (safeRefundStatus === 'pending' && safeRefundAmountInRupees > 0) {
      const refundAmountText = formatCurrencyInRupees(safeRefundAmountInRupees);
      refundPolicyText = `Refund of ${refundAmountText} is being processed to your payment method. Admin commission is retained.`;
      refundPolicyHtml = `<strong style="color: #0369a1;">Refund of ${refundAmountText} is being processed to your payment method. Admin commission is retained.</strong>`;
    } else {
      refundPolicyText = 'Please contact support for the latest refund status.';
      refundPolicyHtml = '<strong style="color: #b45309;">Please contact support for the latest refund status.</strong>';
    }
  } else if (safeCancelledByRole === 'patient') {
    if (safeRefundStatus === 'succeeded' && safeRefundAmountInRupees > 0) {
      const refundAmountText = formatCurrencyInRupees(safeRefundAmountInRupees);
      refundPolicyText = `You cancelled within 15 minutes. Full refund of ${refundAmountText} has been processed.`;
      refundPolicyHtml = `<strong style="color: #047857;">You cancelled within 15 minutes. Full refund of ${refundAmountText} has been processed.</strong>`;
    } else if (safeRefundStatus === 'pending' && safeRefundAmountInRupees > 0) {
      const refundAmountText = formatCurrencyInRupees(safeRefundAmountInRupees);
      refundPolicyText = `You cancelled within 15 minutes. Full refund of ${refundAmountText} is being processed.`;
      refundPolicyHtml = `<strong style="color: #0369a1;">You cancelled within 15 minutes. Full refund of ${refundAmountText} is being processed.</strong>`;
    } else {
      refundPolicyText = 'No refund was processed. Refund is only available within 15 minutes of booking.';
      refundPolicyHtml = '<strong>No refund was processed. Refund is only available within 15 minutes of booking.</strong>';
    }
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Appointment Cancelled',
    text: [
      `Hi ${safePatientName},`,
      '',
      cancellationSummaryText,
      `Date: ${appointmentDate}`,
      `Time: ${fromTime} - ${toTime}`,
      `Mode: ${modeLabel}`,
      `Paid Amount: ${amountText}`,
      refundPolicyText
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Appointment Cancelled</h2>
        <p style="margin: 0 0 16px;">Hi ${safePatientName},</p>
        <p style="margin: 0 0 16px;">${cancellationSummaryText.replace(safeDoctorName, `<strong>${safeDoctorName}</strong>`)}</p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px;">
          <p style="margin: 0 0 8px;"><strong>Date:</strong> ${appointmentDate}</p>
          <p style="margin: 0 0 8px;"><strong>Time:</strong> ${fromTime} - ${toTime}</p>
          <p style="margin: 0 0 8px;"><strong>Mode:</strong> ${modeLabel}</p>
          <p style="margin: 0;"><strong>Paid Amount:</strong> ${amountText}</p>
        </div>

        <p style="margin: 0; color: #b91c1c;">${refundPolicyHtml}</p>
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
  amountInRupees,
  cancelledByRole = '',
  refundStatus = 'not_applicable',
  refundAmountInRupees = 0
}) => {
  ensureSmtpCredentials();

  const safeDoctorName = String(doctorName || '').trim() || 'Doctor';
  const safePatientName = String(patientName || '').trim() || 'Patient';
  const safePatientEmail = String(patientEmail || '').trim() || 'Not provided';
  const safeCancelledByRole = String(cancelledByRole || '').trim().toLowerCase();
  const safeRefundStatus = String(refundStatus || '').trim().toLowerCase();
  const safeRefundAmountInRupees = Math.max(0, Math.trunc(Number(refundAmountInRupees || 0)));
  const modeLabel = consultationMode === 'offline' ? 'Offline (Clinic Visit)' : 'Online Consultation';
  const amountText = formatCurrencyInRupees(amountInRupees);

  let cancellationSummaryText = `An appointment with ${safePatientName} has been cancelled.`;
  let refundPolicyText = 'No refund was processed for this cancellation.';
  let refundPolicyHtml = '<strong>No refund was processed for this cancellation.</strong>';

  if (safeCancelledByRole === 'doctor') {
    cancellationSummaryText = `You cancelled the appointment with ${safePatientName}.`;

    if (safeRefundStatus === 'succeeded' && safeRefundAmountInRupees > 0) {
      const refundAmountText = formatCurrencyInRupees(safeRefundAmountInRupees);
      refundPolicyText = `Refund of ${refundAmountText} was processed to the patient. Admin commission is retained and your payout is set to Rs 0.`;
      refundPolicyHtml = `<strong style="color: #047857;">Refund of ${refundAmountText} was processed to the patient. Admin commission is retained and your payout is set to Rs 0.</strong>`;
    } else if (safeRefundStatus === 'pending' && safeRefundAmountInRupees > 0) {
      const refundAmountText = formatCurrencyInRupees(safeRefundAmountInRupees);
      refundPolicyText = `Refund of ${refundAmountText} is being processed to the patient. Admin commission is retained and your payout is set to Rs 0.`;
      refundPolicyHtml = `<strong style="color: #0369a1;">Refund of ${refundAmountText} is being processed to the patient. Admin commission is retained and your payout is set to Rs 0.</strong>`;
    } else {
      refundPolicyText = 'The appointment is cancelled and your payout is set to Rs 0.';
      refundPolicyHtml = '<strong style="color: #b45309;">The appointment is cancelled and your payout is set to Rs 0.</strong>';
    }
  } else if (safeCancelledByRole === 'patient') {
    cancellationSummaryText = `An appointment with ${safePatientName} has been cancelled by the patient.`;

    if (safeRefundStatus === 'succeeded' && safeRefundAmountInRupees > 0) {
      const refundAmountText = formatCurrencyInRupees(safeRefundAmountInRupees);
      refundPolicyText = `Patient cancelled within 15 minutes. Full refund of ${refundAmountText} was processed and payout is set to Rs 0.`;
      refundPolicyHtml = `<strong style="color: #047857;">Patient cancelled within 15 minutes. Full refund of ${refundAmountText} was processed and payout is set to Rs 0.</strong>`;
    } else if (safeRefundStatus === 'pending' && safeRefundAmountInRupees > 0) {
      const refundAmountText = formatCurrencyInRupees(safeRefundAmountInRupees);
      refundPolicyText = `Patient cancelled within 15 minutes. Full refund of ${refundAmountText} is being processed and payout is set to Rs 0.`;
      refundPolicyHtml = `<strong style="color: #0369a1;">Patient cancelled within 15 minutes. Full refund of ${refundAmountText} is being processed and payout is set to Rs 0.</strong>`;
    } else {
      refundPolicyText = 'No refund was processed. Refund is only available within 15 minutes of booking.';
      refundPolicyHtml = '<strong>No refund was processed. Refund is only available within 15 minutes of booking.</strong>';
    }
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Appointment Cancellation Notice',
    text: [
      `Hi ${safeDoctorName},`,
      '',
      cancellationSummaryText,
      `Date: ${appointmentDate}`,
      `Time: ${fromTime} - ${toTime}`,
      `Mode: ${modeLabel}`,
      `Slot Price: ${amountText}`,
      `Patient Name: ${safePatientName}`,
      `Patient Email: ${safePatientEmail}`,
      refundPolicyText
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Appointment Cancellation Notice</h2>
        <p style="margin: 0 0 16px;">Hi ${safeDoctorName},</p>
        <p style="margin: 0 0 16px;">${cancellationSummaryText.replace(safePatientName, `<strong>${safePatientName}</strong>`)}</p>

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

        <p style="margin: 14px 0 0; color: #b91c1c;">${refundPolicyHtml}</p>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendPatientAppointmentRescheduledEmail = async ({
  to,
  patientName,
  doctorName,
  previousAppointmentDate,
  previousFromTime,
  previousToTime,
  appointmentDate,
  fromTime,
  toTime,
  consultationMode,
  amountInRupees,
  reason
}) => {
  ensureSmtpCredentials();

  const safePatientName = String(patientName || '').trim() || 'Patient';
  const safeDoctorName = String(doctorName || '').trim() || 'Doctor';
  const safeReason = String(reason || '').trim() || 'Schedule adjusted by your doctor.';
  const modeLabel = consultationMode === 'offline' ? 'Offline (Clinic Visit)' : 'Online Consultation';
  const amountText = formatCurrencyInRupees(amountInRupees);

  const previousSlotText = `${previousAppointmentDate} (${previousFromTime} - ${previousToTime})`;
  const newSlotText = `${appointmentDate} (${fromTime} - ${toTime})`;

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Appointment Rescheduled',
    text: [
      `Hi ${safePatientName},`,
      '',
      `Your doctor (${safeDoctorName}) has rescheduled your appointment.`,
      `Previous Slot: ${previousSlotText}`,
      `New Slot: ${newSlotText}`,
      `Mode: ${modeLabel}`,
      `Paid Amount (Unchanged): ${amountText}`,
      'No additional payment is required for this reschedule.',
      `Reason: ${safeReason}`
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Appointment Rescheduled</h2>
        <p style="margin: 0 0 16px;">Hi ${safePatientName},</p>
        <p style="margin: 0 0 16px;">Your doctor (<strong>${safeDoctorName}</strong>) has rescheduled your appointment.</p>

        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px;">
          <p style="margin: 0 0 8px;"><strong>Previous Slot:</strong> ${previousSlotText}</p>
          <p style="margin: 0;"><strong>New Slot:</strong> ${newSlotText}</p>
        </div>

        <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 14px 16px;">
          <p style="margin: 0 0 8px;"><strong>Mode:</strong> ${modeLabel}</p>
          <p style="margin: 0 0 8px;"><strong>Paid Amount (Unchanged):</strong> ${amountText}</p>
          <p style="margin: 0 0 8px;"><strong>Payment:</strong> No additional payment is required for this reschedule.</p>
          <p style="margin: 0;"><strong>Reason:</strong> ${safeReason}</p>
        </div>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendNewChatMessageEmail = async ({
  to,
  recipientName,
  senderName,
  senderRole,
  messagePreview
}) => {
  ensureSmtpCredentials();

  const safeRecipientName = String(recipientName || '').trim() || 'User';
  const safeSenderName = String(senderName || '').trim() || 'Someone';
  const senderType = String(senderRole || '').toLowerCase() === 'doctor' ? 'doctor' : 'patient';
  
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `New message from ${senderType} ${safeSenderName}`,
    text: [
      `Hi ${safeRecipientName},`,
      '',
      `You have received a new message from ${senderType} ${safeSenderName}:`,
      `"${messagePreview}"`,
      '',
      `Log in to your account to reply.`
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">New Chat Message</h2>
        <p style="margin: 0 0 16px;">Hi ${safeRecipientName},</p>
        <p style="margin: 0 0 16px;">You have received a new message from ${senderType} <strong>${safeSenderName}</strong>.</p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; font-style: italic;">
          "${messagePreview}"
        </div>
        <p style="margin: 0;"><a href="${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}" style="color: #1EBDB8; text-decoration: none; font-weight: bold;">Log in to reply</a></p>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendPrescriptionEmail = async ({ to, patientName, doctorName }) => {
  ensureSmtpCredentials();

  const safePatientName = String(patientName || '').trim() || 'Patient';
  const safeDoctorName = String(doctorName || '').trim() || 'Your Doctor';

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `New Prescription from Dr. ${safeDoctorName}`,
    text: [
      `Hi ${safePatientName},`,
      '',
      `Dr. ${safeDoctorName} has sent you a new prescription.`,
      'Please log in to your account to view it in your Prescriptions section.',
      '',
      'Thank you for using Simple.'
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="margin-bottom: 8px; color: #1EBDB8;">New Prescription Received</h2>
        <p style="margin: 0 0 16px;">Hi ${safePatientName},</p>
        <p style="margin: 0 0 16px;">
          <strong>Dr. ${safeDoctorName}</strong> has issued you a new prescription.
        </p>
        <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px;">
          <p style="margin: 0;">Log in to your account and navigate to the <strong>Prescriptions</strong> tab to view the full details.</p>
        </div>
        <p style="margin: 0;"><a href="${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/dashboard/prescriptions" style="color: #1EBDB8; text-decoration: none; font-weight: bold;">View Prescription &rarr;</a></p>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
};

export const sendWithdrawApprovedEmail = async ({ to, doctorName, amountInRupees, bankName, accountNumber }) => {
  ensureSmtpCredentials();
  const safeName = String(doctorName || 'Doctor').trim();
  const amountText = `Rs ${Math.trunc(Number(amountInRupees || 0)).toLocaleString('en-PK')}`;
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Withdrawal Request Approved',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #15803d; margin-bottom: 8px;">Withdrawal Approved ✓</h2>
        <p>Hi Dr. ${safeName},</p>
        <p>Your withdrawal request of <strong>${amountText}</strong> has been <strong style="color:#15803d;">approved</strong>.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin:16px 0;">
          <p style="margin:0 0 6px;"><strong>Amount:</strong> ${amountText}</p>
          <p style="margin:0 0 6px;"><strong>Bank:</strong> ${String(bankName || '').trim() || 'N/A'}</p>
          <p style="margin:0;"><strong>Account:</strong> ${String(accountNumber || '').trim() || 'N/A'}</p>
        </div>
        <p>The funds will be transferred to your bank account within <strong>2–3 business days</strong>.</p>
        <p style="color:#6b7280;font-size:13px;">If you have any questions, please contact our support team.</p>
      </div>
    `
  };
  await getTransporter().sendMail(mailOptions);
};

export const sendWithdrawRejectedEmail = async ({ to, doctorName, amountInRupees, rejectionReason }) => {
  ensureSmtpCredentials();
  const safeName = String(doctorName || 'Doctor').trim();
  const amountText = `Rs ${Math.trunc(Number(amountInRupees || 0)).toLocaleString('en-PK')}`;
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Withdrawal Request Rejected',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #b91c1c; margin-bottom: 8px;">Withdrawal Not Approved</h2>
        <p>Hi Dr. ${safeName},</p>
        <p>Your withdrawal request of <strong>${amountText}</strong> has been <strong style="color:#b91c1c;">rejected</strong>.</p>
        ${rejectionReason ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:16px 0;"><p style="margin:0;"><strong>Reason:</strong> ${rejectionReason}</p></div>` : ''}
        <p>Your balance has <strong>not</strong> been deducted. Please contact support if you have questions.</p>
      </div>
    `
  };
  await getTransporter().sendMail(mailOptions);
};

// ─── Store Order Emails ───────────────────────────────────────────────────────

export const sendStoreOrderPlacedEmail = async ({ to, patientName, storeName, items, totalAmount, paymentMethod, orderId }) => {
  ensureSmtpCredentials();
  const safePatientName = String(patientName || 'Patient').trim();
  const safeStoreName = String(storeName || 'Medical Store').trim();
  const itemsHtml = (items || []).map(i => `<li style="margin-bottom:4px;"><strong>${i.name}</strong> × ${i.quantity} — Rs ${(i.price * i.quantity).toLocaleString('en-PK')}</li>`).join('');
  const amountText = `Rs ${Number(totalAmount || 0).toLocaleString('en-PK')}`;
  const paymentLabel = paymentMethod === 'stripe' ? 'Online (Card)' : 'Cash on Delivery';

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Order Placed — ${safeStoreName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #1EBDB8; margin-bottom: 8px;">Order Placed Successfully 🎉</h2>
        <p>Hi ${safePatientName},</p>
        <p>Your order has been placed at <strong>${safeStoreName}</strong> and is pending review.</p>
        <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 14px 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px;"><strong>Items:</strong></p>
          <ul style="margin: 0 0 8px; padding-left: 18px;">${itemsHtml}</ul>
          <p style="margin: 0 0 4px;"><strong>Total: ${amountText}</strong></p>
          <p style="margin: 0;"><strong>Payment:</strong> ${paymentLabel}</p>
        </div>
        <p style="color: #6b7280; font-size: 13px;">The store will review your prescription and contact you to confirm the order.</p>
      </div>
    `
  });
};

export const sendStoreNewOrderEmail = async ({ to, storeName, patientName, items, totalAmount, orderId }) => {
  ensureSmtpCredentials();
  const safeStoreName = String(storeName || 'Your Store').trim();
  const safePatientName = String(patientName || 'A patient').trim();
  const itemsHtml = (items || []).map(i => `<li style="margin-bottom:4px;"><strong>${i.name}</strong> × ${i.quantity} — Rs ${(i.price * i.quantity).toLocaleString('en-PK')}</li>`).join('');
  const amountText = `Rs ${Number(totalAmount || 0).toLocaleString('en-PK')}`;

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `New Order Received — ${safePatientName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #1EBDB8; margin-bottom: 8px;">New Order Received 📦</h2>
        <p>Hi ${safeStoreName},</p>
        <p><strong>${safePatientName}</strong> has placed a new order that requires your review.</p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px;"><strong>Items:</strong></p>
          <ul style="margin: 0 0 8px; padding-left: 18px;">${itemsHtml}</ul>
          <p style="margin: 0;"><strong>Total: ${amountText}</strong></p>
        </div>
        <p>Please log in to review the prescription and accept or decline this order.</p>
      </div>
    `
  });
};

export const sendStoreOrderAcceptedEmail = async ({ to, patientName, storeName, items, totalAmount, paymentMethod, storeNote }) => {
  ensureSmtpCredentials();
  const safePatientName = String(patientName || 'Patient').trim();
  const safeStoreName = String(storeName || 'Medical Store').trim();
  const itemsHtml = (items || []).map(i => `<li style="margin-bottom:4px;"><strong>${i.name}</strong> × ${i.quantity} — Rs ${(i.price * i.quantity).toLocaleString('en-PK')}</li>`).join('');
  const amountText = `Rs ${Number(totalAmount || 0).toLocaleString('en-PK')}`;
  const paymentLabel = paymentMethod === 'stripe' ? 'Online (Card) — already charged' : 'Cash on Delivery';

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Your Order is Accepted — ${safeStoreName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #15803d; margin-bottom: 8px;">Order Accepted ✅</h2>
        <p>Hi ${safePatientName},</p>
        <p>Great news! <strong>${safeStoreName}</strong> has accepted your order.</p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px;"><strong>Items:</strong></p>
          <ul style="margin: 0 0 8px; padding-left: 18px;">${itemsHtml}</ul>
          <p style="margin: 0 0 4px;"><strong>Total: ${amountText}</strong></p>
          <p style="margin: 0;"><strong>Payment:</strong> ${paymentLabel}</p>
          ${storeNote ? `<p style="margin: 8px 0 0;"><strong>Note from store:</strong> ${storeNote}</p>` : ''}
        </div>
        <p>The store will prepare your medicines for delivery or pickup soon.</p>
      </div>
    `
  });
};

export const sendStoreOrderRejectedEmail = async ({ to, patientName, storeName, items, totalAmount, paymentMethod, rejectionReason, refundProcessed }) => {
  ensureSmtpCredentials();
  const safePatientName = String(patientName || 'Patient').trim();
  const safeStoreName = String(storeName || 'Medical Store').trim();
  const itemsHtml = (items || []).map(i => `<li style="margin-bottom:4px;">${i.name} × ${i.quantity}</li>`).join('');
  const amountText = `Rs ${Number(totalAmount || 0).toLocaleString('en-PK')}`;
  const refundNote = (paymentMethod === 'stripe' && refundProcessed)
    ? `<p style="color:#047857;"><strong>Refund of ${amountText} has been initiated</strong> to your original payment method.</p>`
    : paymentMethod === 'stripe'
      ? '<p style="color:#b45309;">Please contact support for refund assistance.</p>'
      : '';

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Order Declined — ${safeStoreName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #b91c1c; margin-bottom: 8px;">Order Declined ❌</h2>
        <p>Hi ${safePatientName},</p>
        <p>Unfortunately, <strong>${safeStoreName}</strong> has declined your order.</p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px;"><strong>Items:</strong></p>
          <ul style="margin: 0 0 8px; padding-left: 18px;">${itemsHtml}</ul>
          ${rejectionReason ? `<p style="margin: 8px 0 0;"><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
        </div>
        ${refundNote}
        <p style="color: #6b7280; font-size: 13px;">You may try ordering from another store. Your prescription documents remain in your account.</p>
      </div>
    `
  });
};

