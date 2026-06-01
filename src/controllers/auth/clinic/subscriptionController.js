import { SubscriptionPricing } from '../../../models/SubscriptionPricing.js';
import { Clinic } from '../../../models/Clinic.js';
import { STRIPE_CURRENCY, getStripeClient } from '../../../services/stripeService.js';

const CLINIC_SUBSCRIPTION_PRICING_KEY = 'clinic-dashboard-subscriptions';
const PAID_PLAN_KEYS = new Set(['gold', 'diamond']);
const PLAN_DURATION_DAYS = 30;

const getDefaultClinicSubscriptionPricing = () => ({
  platinumPriceInRupees: 0,
  goldPriceInRupees: 1999,
  diamondPriceInRupees: 4999
});

const normalizePriceInRupees = (value, fallbackValue) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return Math.max(0, Math.trunc(Number(fallbackValue || 0)));
  return Math.max(0, Math.trunc(numericValue));
};

const normalizePlanKey = (planValue) => {
  const normalizedPlan = String(planValue || '').trim().toLowerCase();
  return ['platinum', 'gold', 'diamond'].includes(normalizedPlan) ? normalizedPlan : '';
};

const normalizeSubscriptionStatus = (statusValue) => {
  const normalizedStatus = String(statusValue || '').trim().toLowerCase();
  return ['active', 'cancelled', 'expired'].includes(normalizedStatus) ? normalizedStatus : 'active';
};

const toDateTimestamp = (dateValue) => {
  const parsedDate = dateValue ? new Date(dateValue) : null;
  return (!parsedDate || Number.isNaN(parsedDate.getTime())) ? 0 : parsedDate.getTime();
};

const addDays = (baseDate, daysCount) => {
  const normalizedBaseTimestamp = toDateTimestamp(baseDate) || Date.now();
  const nextDate = new Date(normalizedBaseTimestamp);
  nextDate.setDate(nextDate.getDate() + daysCount);
  return nextDate;
};

const getPrimaryClientUrl = () => {
  const configuredOrigins = String(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configuredOrigins[0] || 'https://simple-a-fyp.vercel.app';
};

const formatPlanLabel = (planValue) => {
  const normalizedPlan = normalizePlanKey(planValue) || 'platinum';
  return normalizedPlan.charAt(0).toUpperCase() + normalizedPlan.slice(1);
};

const mapClinicSessionPayload = (clinicRecord) => ({
  id: clinicRecord._id,
  name: clinicRecord.name,
  email: clinicRecord.email,
  role: clinicRecord.role,
  applicationStatus: clinicRecord.applicationStatus,
  avatarUrl: String(clinicRecord?.avatarDocument?.url || '').trim(),
  currentPlan: normalizePlanKey(clinicRecord?.currentPlan) || 'platinum',
  subscriptionStatus: normalizeSubscriptionStatus(clinicRecord?.subscriptionStatus),
  planActivatedAt: clinicRecord?.planActivatedAt || null,
  planExpiresAt: clinicRecord?.planExpiresAt || null,
  lastPlanPaymentAt: clinicRecord?.lastPlanPaymentAt || null
});

const mapClinicSubscriptionPricing = (pricingRecord) => {
  const fallbackPricing = getDefaultClinicSubscriptionPricing();
  return {
    platinumPriceInRupees: normalizePriceInRupees(pricingRecord?.platinumPriceInRupees, fallbackPricing.platinumPriceInRupees),
    goldPriceInRupees: normalizePriceInRupees(pricingRecord?.goldPriceInRupees, fallbackPricing.goldPriceInRupees),
    diamondPriceInRupees: normalizePriceInRupees(pricingRecord?.diamondPriceInRupees, fallbackPricing.diamondPriceInRupees),
    updatedAt: pricingRecord?.updatedAt || null
  };
};

const resolveEffectiveClinicPlan = (clinicRecord, now = new Date()) => {
  const storedPlan = normalizePlanKey(clinicRecord?.currentPlan) || 'platinum';
  const storedStatus = normalizeSubscriptionStatus(clinicRecord?.subscriptionStatus);
  const planExpiryTimestamp = toDateTimestamp(clinicRecord?.planExpiresAt);
  const nowTimestamp = now.getTime();

  if (PAID_PLAN_KEYS.has(storedPlan) && storedStatus === 'active' && planExpiryTimestamp > nowTimestamp) {
    return { currentPlan: storedPlan, subscriptionStatus: 'active' };
  }
  if (storedPlan === 'platinum') return { currentPlan: 'platinum', subscriptionStatus: 'active' };
  if (storedStatus === 'cancelled') return { currentPlan: 'platinum', subscriptionStatus: 'cancelled' };
  return { currentPlan: 'platinum', subscriptionStatus: 'expired' };
};

const mapClinicSubscriptionStatus = (clinicRecord, now = new Date()) => {
  const effectivePlanState = resolveEffectiveClinicPlan(clinicRecord, now);
  const planExpiryTimestamp = toDateTimestamp(clinicRecord?.planExpiresAt);
  const nowTimestamp = now.getTime();
  const isPaidPlanActive = PAID_PLAN_KEYS.has(effectivePlanState.currentPlan);
  const daysRemaining = isPaidPlanActive
    ? Math.max(0, Math.ceil((planExpiryTimestamp - nowTimestamp) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    currentPlan: effectivePlanState.currentPlan,
    subscriptionStatus: effectivePlanState.subscriptionStatus,
    planActivatedAt: clinicRecord?.planActivatedAt || null,
    planExpiresAt: isPaidPlanActive ? clinicRecord?.planExpiresAt || null : null,
    planCancelledAt: clinicRecord?.planCancelledAt || null,
    lastPlanPaymentAt: clinicRecord?.lastPlanPaymentAt || null,
    isPaidPlanActive,
    daysRemaining
  };
};

const expireClinicPaidPlanIfNeeded = async (clinicRecord, now = new Date()) => {
  if (!clinicRecord) return null;
  const storedPlan = normalizePlanKey(clinicRecord.currentPlan) || 'platinum';
  const storedStatus = normalizeSubscriptionStatus(clinicRecord.subscriptionStatus);
  const planExpiryTimestamp = toDateTimestamp(clinicRecord.planExpiresAt);

  if (PAID_PLAN_KEYS.has(storedPlan) && storedStatus === 'active' && planExpiryTimestamp > 0 && planExpiryTimestamp <= now.getTime()) {
    clinicRecord.currentPlan = 'platinum';
    clinicRecord.subscriptionStatus = 'expired';
    clinicRecord.planCancelledAt = now;
    await clinicRecord.save();
  }

  return clinicRecord;
};

const resolveCheckoutAction = (clinicRecord, requestedPlan, now = new Date()) => {
  const effectivePlanState = resolveEffectiveClinicPlan(clinicRecord, now);
  if (!PAID_PLAN_KEYS.has(requestedPlan)) return '';
  if (!PAID_PLAN_KEYS.has(effectivePlanState.currentPlan)) return 'buy';
  if (effectivePlanState.currentPlan === requestedPlan) return 'renew';
  return 'update';
};

const getPriceForPlan = (pricingRecord, plan) => {
  const mappedPricing = mapClinicSubscriptionPricing(pricingRecord);
  if (plan === 'gold') return mappedPricing.goldPriceInRupees;
  if (plan === 'diamond') return mappedPricing.diamondPriceInRupees;
  return 0;
};

const getOrCreateClinicSubscriptionPricing = async () => {
  const fallbackPricing = getDefaultClinicSubscriptionPricing();
  return SubscriptionPricing.findOneAndUpdate(
    { key: CLINIC_SUBSCRIPTION_PRICING_KEY },
    { $setOnInsert: { key: CLINIC_SUBSCRIPTION_PRICING_KEY, ...fallbackPricing } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const getStripeCustomerIdForClinic = async (clinicRecord, stripeClient) => {
  const existingId = String(clinicRecord?.stripeCustomerId || '').trim();
  if (existingId) return existingId;

  const customer = await stripeClient.customers.create({
    email: String(clinicRecord?.email || '').trim().toLowerCase(),
    name: String(clinicRecord?.name || '').trim() || 'Clinic',
    metadata: { clinicId: String(clinicRecord?._id || '') }
  });
  clinicRecord.stripeCustomerId = customer.id;
  await clinicRecord.save();
  return customer.id;
};

export const getClinicSubscriptionPricing = async (req, res) => {
  try {
    const pricingRecord = await getOrCreateClinicSubscriptionPricing();
    return res.status(200).json({ pricing: mapClinicSubscriptionPricing(pricingRecord), currency: STRIPE_CURRENCY });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic subscription pricing', error: error.message });
  }
};

export const getClinicSubscriptionStatus = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id);
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });
    await expireClinicPaidPlanIfNeeded(clinic);
    return res.status(200).json({
      subscription: mapClinicSubscriptionStatus(clinic),
      clinic: mapClinicSessionPayload(clinic)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch clinic subscription status', error: error.message });
  }
};

export const createClinicSubscriptionCheckoutSession = async (req, res) => {
  try {
    const selectedPlan = normalizePlanKey(req.body?.plan);
    if (!PAID_PLAN_KEYS.has(selectedPlan)) return res.status(400).json({ message: 'Please select a valid paid plan (gold or diamond)' });

    const clinic = await Clinic.findById(req.user?.id);
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });

    const now = new Date();
    await expireClinicPaidPlanIfNeeded(clinic, now);

    const pricingRecord = await getOrCreateClinicSubscriptionPricing();
    const amountInRupees = getPriceForPlan(pricingRecord, selectedPlan);
    if (!amountInRupees || amountInRupees <= 0) return res.status(400).json({ message: 'Plan pricing not configured' });

    const action = resolveCheckoutAction(clinic, selectedPlan, now);
    if (!action) return res.status(400).json({ message: 'Could not resolve purchase action' });

    const stripeClient = getStripeClient();
    const customerId = await getStripeCustomerIdForClinic(clinic, stripeClient);
    const clientBaseUrl = getPrimaryClientUrl();
    const successUrl = `${clientBaseUrl}/clinic/dashboard/subscriptions?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${clientBaseUrl}/clinic/dashboard/subscriptions?checkout=cancelled`;

    const checkoutSession = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: STRIPE_CURRENCY,
          unit_amount: amountInRupees * 100,
          product_data: {
            name: `${formatPlanLabel(selectedPlan)} Plan`,
            description: `${PLAN_DURATION_DAYS}-day clinic subscription plan`
          }
        }
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { clinicId: String(clinic._id), plan: selectedPlan, action, amountInRupees: String(amountInRupees) },
      client_reference_id: String(clinic._id)
    });

    return res.status(200).json({ checkoutUrl: checkoutSession.url, sessionId: checkoutSession.id, plan: selectedPlan, action, amountInRupees });
  } catch (error) {
    return res.status(500).json({ message: 'Could not create stripe session', error: error.message });
  }
};

export const confirmClinicSubscriptionCheckoutSession = async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ message: 'Session ID is required' });

    const clinic = await Clinic.findById(req.user?.id);
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });
    await expireClinicPaidPlanIfNeeded(clinic);

    const stripeClient = getStripeClient();
    const checkoutSession = await stripeClient.checkout.sessions.retrieve(sessionId);
    if (!checkoutSession || checkoutSession.metadata?.clinicId !== String(clinic._id) || checkoutSession.payment_status !== 'paid') {
      return res.status(400).json({ message: 'Invalid or unpaid session' });
    }

    const selectedPlan = normalizePlanKey(checkoutSession.metadata?.plan);
    const action = String(checkoutSession.metadata?.action || '').trim().toLowerCase();
    const purchaseDate = new Date(checkoutSession.created * 1000);

    const previousPlanExpiry = toDateTimestamp(clinic.planExpiresAt);
    const isRenewal = action === 'renew'
      && clinic.currentPlan === selectedPlan
      && clinic.subscriptionStatus === 'active'
      && previousPlanExpiry > purchaseDate.getTime();
    const renewalBaseDate = isRenewal ? new Date(previousPlanExpiry) : purchaseDate;
    const nextExpiryDate = addDays(renewalBaseDate, PLAN_DURATION_DAYS);

    clinic.currentPlan = selectedPlan;
    clinic.subscriptionStatus = 'active';
    clinic.planActivatedAt = isRenewal ? (clinic.planActivatedAt || purchaseDate) : purchaseDate;
    clinic.planExpiresAt = nextExpiryDate;
    clinic.planCancelledAt = null;
    clinic.lastPlanPaymentAt = purchaseDate;
    clinic.lastPlanCheckoutSessionId = sessionId;
    clinic.lastPlanPaymentIntentId = checkoutSession.payment_intent || '';
    if (checkoutSession.customer) clinic.stripeCustomerId = checkoutSession.customer;
    await clinic.save();

    return res.status(200).json({
      message: `${formatPlanLabel(selectedPlan)} plan activated successfully`,
      subscription: mapClinicSubscriptionStatus(clinic),
      clinic: mapClinicSessionPayload(clinic)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not confirm payment', error: error.message });
  }
};

export const cancelClinicSubscription = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.user?.id);
    if (!clinic) return res.status(404).json({ message: 'Clinic not found' });
    await expireClinicPaidPlanIfNeeded(clinic);

    if (!PAID_PLAN_KEYS.has(clinic.currentPlan)) {
      return res.status(200).json({
        message: 'Already on Platinum',
        subscription: mapClinicSubscriptionStatus(clinic),
        clinic: mapClinicSessionPayload(clinic)
      });
    }

    clinic.currentPlan = 'platinum';
    clinic.subscriptionStatus = 'cancelled';
    clinic.planCancelledAt = new Date();
    clinic.planExpiresAt = new Date();
    await clinic.save();

    return res.status(200).json({
      message: 'Subscription cancelled. Switched to Platinum plan.',
      subscription: mapClinicSubscriptionStatus(clinic),
      clinic: mapClinicSessionPayload(clinic)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not cancel subscription', error: error.message });
  }
};
