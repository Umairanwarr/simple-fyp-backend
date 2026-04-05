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

export const sendVerificationOtpEmail = async ({ to, firstName, otp }) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials are missing in environment variables.');
  }

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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials are missing in environment variables.');
  }

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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials are missing in environment variables.');
  }

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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials are missing in environment variables.');
  }

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
