import { DoctorSubscriptionPayment } from '../../../models/DoctorSubscriptionPayment.js';
import { DoctorSubscriptionNotification } from '../../../models/DoctorSubscriptionNotification.js';
import { SubscriptionPricing } from '../../../models/SubscriptionPricing.js';
import { sendDoctorSubscriptionLifecycleEmail } from '../../../services/mailService.js';
import { Doctor, STRIPE_CURRENCY, getStripeClient, mapDoctorSessionPayload } from './shared.js';

const DOCTOR_SUBSCRIPTION_PRICING_KEY = 'doctor-dashboard-subscriptions';
const PAID_PLAN_KEYS = new Set(['gold', 'diamond']);
const PLAN_DURATION_DAYS = 30;

const getDefaultDoctorSubscriptionPricing = () => {
  return {
    platinumPriceInRupees: 0,
    goldPriceInRupees: 999,
    diamondPriceInRupees: 2999
  };
};

const normalizePriceInRupees = (value, fallbackValue) => {
  const normalizedFallback = Number.isFinite(Number(fallbackValue))
    ? Number(fallbackValue)
    : 0;

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return Math.max(0, Math.trunc(normalizedFallback));
  }

  return Math.max(0, Math.trunc(numericValue));
};

const mapDoctorSubscriptionPricing = (pricingRecord) => {
  const fallbackPricing = getDefaultDoctorSubscriptionPricing();

  return {
    platinumPriceInRupees: normalizePriceInRupees(
      pricingRecord?.platinumPriceInRupees ?? pricingRecord?.platinumPriceInUsd,
      fallbackPricing.platinumPriceInRupees
    ),
    goldPriceInRupees: normalizePriceInRupees(
      pricingRecord?.goldPriceInRupees ?? pricingRecord?.goldPriceInUsd,
      fallbackPricing.goldPriceInRupees
    ),
    diamondPriceInRupees: normalizePriceInRupees(
      pricingRecord?.diamondPriceInRupees ?? pricingRecord?.diamondPriceInUsd,
      fallbackPricing.diamondPriceInRupees
    ),
    updatedAt: pricingRecord?.updatedAt || null
  };
};

const getPrimaryClientUrl = () => {
  const configuredOrigins = String(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => String(origin || '').trim())
    .filter(Boolean);

  return configuredOrigins[0] || 'http://localhost:5173';
};

const formatPlanLabel = (planValue) => {
  const normalizedPlan = normalizePlanKey(planValue) || 'platinum';
  return normalizedPlan.charAt(0).toUpperCase() + normalizedPlan.slice(1);
};

const safeCreateDoctorSubscriptionNotification = async ({
  doctorId,
  eventType,
  title,
  message,
  meta = {},
  createdAt = null
}) => {
  if (!doctorId) {
    return;
  }

  try {
    await DoctorSubscriptionNotification.create({
      doctorId,
      eventType,
      title,
      message,
      meta,
      createdAt: createdAt || new Date()
    });
  } catch (error) {
    // Notification persistence should not break subscription state updates.
  }
};

const safeSendDoctorSubscriptionEmail = async ({
  to,
  doctorName,
  eventType,
  planName,
  amountInRupees = 0,
  expiresAt = null
}) => {
  if (!to) {
    return;
  }

  try {
    await sendDoctorSubscriptionLifecycleEmail({
      to,
      doctorName,
      eventType,
      planName,
      amountInRupees,
      expiresAt
    });
  } catch (error) {
    // Email delivery should not break subscription state updates.
  }
};

const normalizePlanKey = (planValue) => {
  const normalizedPlan = String(planValue || '').trim().toLowerCase();

  if (normalizedPlan === 'gold' || normalizedPlan === 'diamond' || normalizedPlan === 'platinum') {
    return normalizedPlan;
  }

  return '';
};

const normalizeSubscriptionStatus = (statusValue) => {
  const normalizedStatus = String(statusValue || '').trim().toLowerCase();

  if (normalizedStatus === 'active' || normalizedStatus === 'cancelled' || normalizedStatus === 'expired') {
    return normalizedStatus;
  }

  return 'active';
};

const toDateTimestamp = (dateValue) => {
  const parsedDate = dateValue ? new Date(dateValue) : null;

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return 0;
  }

  return parsedDate.getTime();
};

const addDays = (baseDate, daysCount) => {
  const normalizedBaseTimestamp = toDateTimestamp(baseDate) || Date.now();
  const nextDate = new Date(normalizedBaseTimestamp);
  nextDate.setDate(nextDate.getDate() + daysCount);
  return nextDate;
};

const resolveEffectiveDoctorPlan = (doctorRecord, now = new Date()) => {
  const storedPlan = normalizePlanKey(doctorRecord?.currentPlan) || 'platinum';
  const storedStatus = normalizeSubscriptionStatus(doctorRecord?.subscriptionStatus);
  const planExpiryTimestamp = toDateTimestamp(doctorRecord?.planExpiresAt);
  const nowTimestamp = now.getTime();

  if (
    PAID_PLAN_KEYS.has(storedPlan)
    && storedStatus === 'active'
    && planExpiryTimestamp > nowTimestamp
  ) {
    return {
      currentPlan: storedPlan,
      subscriptionStatus: 'active'
    };
  }

  if (storedPlan === 'platinum') {
    return {
      currentPlan: 'platinum',
      subscriptionStatus: 'active'
    };
  }

  if (storedStatus === 'cancelled') {
    return {
      currentPlan: 'platinum',
      subscriptionStatus: 'cancelled'
    };
  }

  return {
    currentPlan: 'platinum',
    subscriptionStatus: 'expired'
  };
};

const mapDoctorSubscriptionStatus = (doctorRecord, now = new Date()) => {
  const effectivePlanState = resolveEffectiveDoctorPlan(doctorRecord, now);
  const planExpiryTimestamp = toDateTimestamp(doctorRecord?.planExpiresAt);
  const nowTimestamp = now.getTime();
  const isPaidPlanActive = PAID_PLAN_KEYS.has(effectivePlanState.currentPlan);
  const daysRemaining = isPaidPlanActive
    ? Math.max(0, Math.ceil((planExpiryTimestamp - nowTimestamp) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    currentPlan: effectivePlanState.currentPlan,
    subscriptionStatus: effectivePlanState.subscriptionStatus,
    planActivatedAt: doctorRecord?.planActivatedAt || null,
    planExpiresAt: isPaidPlanActive ? doctorRecord?.planExpiresAt || null : null,
    planCancelledAt: doctorRecord?.planCancelledAt || null,
    lastPlanPaymentAt: doctorRecord?.lastPlanPaymentAt || null,
    isPaidPlanActive,
    daysRemaining
  };
};

const expireDoctorPaidPlanIfNeeded = async (doctorRecord, now = new Date()) => {
  if (!doctorRecord) {
    return null;
  }

  const storedPlan = normalizePlanKey(doctorRecord.currentPlan) || 'platinum';
  const storedStatus = normalizeSubscriptionStatus(doctorRecord.subscriptionStatus);
  const planExpiryTimestamp = toDateTimestamp(doctorRecord.planExpiresAt);

  if (
    PAID_PLAN_KEYS.has(storedPlan)
    && storedStatus === 'active'
    && planExpiryTimestamp > 0
    && planExpiryTimestamp <= now.getTime()
  ) {
    const expiredPlanLabel = formatPlanLabel(storedPlan);
    const expiryDate = doctorRecord.planExpiresAt || now;

    doctorRecord.currentPlan = 'platinum';
    doctorRecord.subscriptionStatus = 'expired';
    doctorRecord.planCancelledAt = now;
    await doctorRecord.save();

    await Promise.allSettled([
      safeCreateDoctorSubscriptionNotification({
        doctorId: doctorRecord._id,
        eventType: 'plan_expired',
        title: `${expiredPlanLabel} plan expired`,
        message: `Your ${expiredPlanLabel} plan has expired. You are now on the Platinum plan.`,
        meta: {
          previousPlan: storedPlan,
          expiredAt: now
        },
        createdAt: now
      }),
      safeSendDoctorSubscriptionEmail({
        to: String(doctorRecord.email || '').trim().toLowerCase(),
        doctorName: doctorRecord.fullName,
        eventType: 'plan_expired',
        planName: expiredPlanLabel,
        amountInRupees: 0,
        expiresAt: expiryDate
      })
    ]);
  }

  return doctorRecord;
};

const resolveCheckoutAction = (doctorRecord, requestedPlan, now = new Date()) => {
  const effectivePlanState = resolveEffectiveDoctorPlan(doctorRecord, now);

  if (!PAID_PLAN_KEYS.has(requestedPlan)) {
    return '';
  }

  if (!PAID_PLAN_KEYS.has(effectivePlanState.currentPlan)) {
    return 'buy';
  }

  if (effectivePlanState.currentPlan === requestedPlan) {
    return 'renew';
  }

  return 'update';
};

const getPriceForPlan = (pricingRecord, plan) => {
  const mappedPricing = mapDoctorSubscriptionPricing(pricingRecord);

  if (plan === 'gold') {
    return mappedPricing.goldPriceInRupees;
  }

  if (plan === 'diamond') {
    return mappedPricing.diamondPriceInRupees;
  }

  return 0;
};

const getOrCreateDoctorSubscriptionPricing = async () => {
  const fallbackPricing = getDefaultDoctorSubscriptionPricing();

  return SubscriptionPricing.findOneAndUpdate(
    {
      key: DOCTOR_SUBSCRIPTION_PRICING_KEY
    },
    {
      $setOnInsert: {
        key: DOCTOR_SUBSCRIPTION_PRICING_KEY,
        ...fallbackPricing
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
};

const getStripeCustomerIdForDoctor = async (doctorRecord, stripeClient) => {
  const existingCustomerId = String(doctorRecord?.stripeCustomerId || '').trim();

  if (existingCustomerId) {
    return existingCustomerId;
  }

  const createdCustomer = await stripeClient.customers.create({
    email: String(doctorRecord?.email || '').trim().toLowerCase(),
    name: String(doctorRecord?.fullName || '').trim() || 'Doctor',
    metadata: {
      doctorId: String(doctorRecord?._id || '')
    }
  });

  doctorRecord.stripeCustomerId = String(createdCustomer?.id || '').trim();
  await doctorRecord.save();

  return doctorRecord.stripeCustomerId;
};

export const getDoctorSubscriptionPricing = async (req, res) => {
  try {
    const pricingRecord = await getOrCreateDoctorSubscriptionPricing();

    return res.status(200).json({
      pricing: mapDoctorSubscriptionPricing(pricingRecord),
      currency: STRIPE_CURRENCY
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not fetch doctor subscription pricing',
      error: error.message
    });
  }
};

export const getDoctorSubscriptionStatus = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    await expireDoctorPaidPlanIfNeeded(doctor);

    return res.status(200).json({
      subscription: mapDoctorSubscriptionStatus(doctor),
      doctor: mapDoctorSessionPayload(doctor)
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not fetch doctor subscription status',
      error: error.message
    });
  }
};

export const createDoctorSubscriptionCheckoutSession = async (req, res) => {
  try {
    const selectedPlan = normalizePlanKey(req.body?.plan);

    if (!PAID_PLAN_KEYS.has(selectedPlan)) {
      return res.status(400).json({
        message: 'Please select a valid paid plan (gold or diamond)'
      });
    }

    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const now = new Date();
    await expireDoctorPaidPlanIfNeeded(doctor, now);

    const pricingRecord = await getOrCreateDoctorSubscriptionPricing();
    const amountInRupees = getPriceForPlan(pricingRecord, selectedPlan);

    if (!Number.isFinite(Number(amountInRupees)) || Number(amountInRupees) <= 0) {
      return res.status(400).json({
        message: 'Plan pricing is not configured correctly. Please contact admin.'
      });
    }

    const action = resolveCheckoutAction(doctor, selectedPlan, now);

    if (!action) {
      return res.status(400).json({ message: 'Could not resolve purchase action' });
    }

    const stripeClient = getStripeClient();
    const stripeCustomerId = await getStripeCustomerIdForDoctor(doctor, stripeClient);
    const clientBaseUrl = getPrimaryClientUrl();
    const successUrl = `${clientBaseUrl}/doctor/dashboard/subscriptions?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${clientBaseUrl}/doctor/dashboard/subscriptions?checkout=cancelled`;

    const checkoutSession = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      customer: stripeCustomerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: STRIPE_CURRENCY,
            unit_amount: amountInRupees * 100,
            product_data: {
              name: `${selectedPlan.charAt(0).toUpperCase()}${selectedPlan.slice(1)} Plan`,
              description: `${PLAN_DURATION_DAYS}-day doctor subscription plan`
            }
          }
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        doctorId: String(doctor._id || ''),
        plan: selectedPlan,
        action,
        amountInRupees: String(amountInRupees)
      },
      client_reference_id: String(doctor._id || '')
    });

    return res.status(200).json({
      checkoutUrl: checkoutSession?.url || '',
      sessionId: String(checkoutSession?.id || ''),
      plan: selectedPlan,
      action,
      amountInRupees
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not create Stripe checkout session',
      error: error.message
    });
  }
};

export const confirmDoctorSubscriptionCheckoutSession = async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();

    if (!sessionId) {
      return res.status(400).json({ message: 'Stripe checkout session id is required' });
    }

    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    await expireDoctorPaidPlanIfNeeded(doctor);

    const existingPaymentRecord = await DoctorSubscriptionPayment.findOne({
      stripeCheckoutSessionId: sessionId,
      status: 'succeeded'
    }).lean();

    if (existingPaymentRecord) {
      return res.status(200).json({
        message: 'Subscription payment already confirmed',
        subscription: mapDoctorSubscriptionStatus(doctor),
        doctor: mapDoctorSessionPayload(doctor)
      });
    }

    const stripeClient = getStripeClient();
    const checkoutSession = await stripeClient.checkout.sessions.retrieve(sessionId);

    if (!checkoutSession) {
      return res.status(404).json({ message: 'Stripe checkout session not found' });
    }

    const sessionDoctorId = String(checkoutSession?.metadata?.doctorId || '').trim();

    if (!sessionDoctorId || sessionDoctorId !== String(doctor._id || '')) {
      return res.status(403).json({ message: 'This checkout session does not belong to you' });
    }

    if (String(checkoutSession?.payment_status || '').trim().toLowerCase() !== 'paid') {
      return res.status(400).json({ message: 'Payment is not completed yet' });
    }

    const selectedPlan = normalizePlanKey(checkoutSession?.metadata?.plan);

    if (!PAID_PLAN_KEYS.has(selectedPlan)) {
      return res.status(400).json({ message: 'Invalid plan in checkout session' });
    }

    const sessionAction = String(checkoutSession?.metadata?.action || '').trim().toLowerCase();
    const action = ['buy', 'renew', 'update'].includes(sessionAction)
      ? sessionAction
      : resolveCheckoutAction(doctor, selectedPlan, new Date());
    const amountFromMetadata = Number(checkoutSession?.metadata?.amountInRupees);
    const amountInRupees = Number.isFinite(amountFromMetadata) && amountFromMetadata >= 0
      ? Math.trunc(amountFromMetadata)
      : Math.max(0, Math.trunc(Number(checkoutSession?.amount_total || 0) / 100));
    const purchaseDate = Number.isFinite(Number(checkoutSession?.created))
      ? new Date(Number(checkoutSession.created) * 1000)
      : new Date();

    const previousPlan = normalizePlanKey(doctor.currentPlan) || 'platinum';
    const previousStatus = normalizeSubscriptionStatus(doctor.subscriptionStatus);
    const previousExpiryTimestamp = toDateTimestamp(doctor.planExpiresAt);
    const isRenewalFromExistingPlan = action === 'renew'
      && previousPlan === selectedPlan
      && previousStatus === 'active'
      && previousExpiryTimestamp > purchaseDate.getTime();
    const renewalBaseDate = isRenewalFromExistingPlan ? new Date(previousExpiryTimestamp) : purchaseDate;
    const nextExpiryDate = addDays(renewalBaseDate, PLAN_DURATION_DAYS);

    doctor.currentPlan = selectedPlan;
    doctor.subscriptionStatus = 'active';
    doctor.planActivatedAt = isRenewalFromExistingPlan
      ? (doctor.planActivatedAt || purchaseDate)
      : purchaseDate;
    doctor.planExpiresAt = nextExpiryDate;
    doctor.planCancelledAt = null;
    doctor.lastPlanPaymentAt = purchaseDate;
    doctor.lastPlanCheckoutSessionId = sessionId;
    doctor.lastPlanPaymentIntentId = String(checkoutSession?.payment_intent || '').trim();

    const stripeCustomerId = String(checkoutSession?.customer || '').trim();

    if (stripeCustomerId) {
      doctor.stripeCustomerId = stripeCustomerId;
    }

    await doctor.save();

    const selectedPlanLabel = formatPlanLabel(selectedPlan);

    await Promise.allSettled([
      safeCreateDoctorSubscriptionNotification({
        doctorId: doctor._id,
        eventType: action === 'renew'
          ? 'plan_renewed'
          : action === 'update'
            ? 'plan_updated'
            : 'plan_bought',
        title: action === 'renew'
          ? `${selectedPlanLabel} plan renewed`
          : action === 'update'
            ? `Plan updated to ${selectedPlanLabel}`
            : `${selectedPlanLabel} plan activated`,
        message: action === 'renew'
          ? `Your ${selectedPlanLabel} plan is renewed and active until ${nextExpiryDate.toLocaleDateString('en-US')}.`
          : action === 'update'
            ? `Your subscription is updated to ${selectedPlanLabel} and active until ${nextExpiryDate.toLocaleDateString('en-US')}.`
            : `Your ${selectedPlanLabel} plan is active until ${nextExpiryDate.toLocaleDateString('en-US')}.`,
        meta: {
          plan: selectedPlan,
          action,
          amountInRupees,
          expiresAt: nextExpiryDate,
          stripeCheckoutSessionId: sessionId
        },
        createdAt: purchaseDate
      }),
      safeSendDoctorSubscriptionEmail({
        to: String(doctor.email || '').trim().toLowerCase(),
        doctorName: doctor.fullName,
        eventType: action === 'renew'
          ? 'plan_renewed'
          : action === 'update'
            ? 'plan_updated'
            : 'plan_bought',
        planName: selectedPlanLabel,
        amountInRupees,
        expiresAt: nextExpiryDate
      })
    ]);

    try {
      await DoctorSubscriptionPayment.create({
        doctorId: doctor._id,
        doctorName: String(doctor.fullName || '').trim() || 'Doctor',
        doctorEmail: String(doctor.email || '').trim().toLowerCase(),
        plan: selectedPlan,
        action,
        amountInRupees,
        currency: String(checkoutSession?.currency || STRIPE_CURRENCY || 'pkr').trim().toLowerCase(),
        status: 'succeeded',
        purchasedAt: purchaseDate,
        expiresAt: nextExpiryDate,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: String(checkoutSession?.payment_intent || '').trim(),
        stripeCustomerId
      });
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    return res.status(200).json({
      message: `${selectedPlan.charAt(0).toUpperCase()}${selectedPlan.slice(1)} plan activated successfully`,
      subscription: mapDoctorSubscriptionStatus(doctor),
      doctor: mapDoctorSessionPayload(doctor)
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not confirm subscription payment',
      error: error.message
    });
  }
};

export const cancelDoctorSubscription = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user?.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    await expireDoctorPaidPlanIfNeeded(doctor);

    const activePlanState = resolveEffectiveDoctorPlan(doctor);

    if (!PAID_PLAN_KEYS.has(activePlanState.currentPlan)) {
      return res.status(200).json({
        message: 'You are already on the Platinum plan',
        subscription: mapDoctorSubscriptionStatus(doctor),
        doctor: mapDoctorSessionPayload(doctor)
      });
    }

    doctor.currentPlan = 'platinum';
    doctor.subscriptionStatus = 'cancelled';
    doctor.planCancelledAt = new Date();
    doctor.planExpiresAt = new Date();
    await doctor.save();

    const cancelledPlanLabel = formatPlanLabel(activePlanState.currentPlan);

    await Promise.allSettled([
      safeCreateDoctorSubscriptionNotification({
        doctorId: doctor._id,
        eventType: 'plan_cancelled',
        title: `${cancelledPlanLabel} plan cancelled`,
        message: `Your ${cancelledPlanLabel} plan has been cancelled. You are now on the Platinum plan.`,
        meta: {
          previousPlan: activePlanState.currentPlan,
          cancelledAt: doctor.planCancelledAt
        },
        createdAt: doctor.planCancelledAt
      }),
      safeSendDoctorSubscriptionEmail({
        to: String(doctor.email || '').trim().toLowerCase(),
        doctorName: doctor.fullName,
        eventType: 'plan_cancelled',
        planName: cancelledPlanLabel,
        amountInRupees: 0,
        expiresAt: doctor.planCancelledAt
      })
    ]);

    return res.status(200).json({
      message: 'Subscription cancelled. Your account is now on the Platinum plan.',
      subscription: mapDoctorSubscriptionStatus(doctor),
      doctor: mapDoctorSessionPayload(doctor)
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not cancel subscription',
      error: error.message
    });
  }
};
