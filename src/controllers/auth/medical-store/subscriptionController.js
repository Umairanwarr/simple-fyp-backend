import { MedicalStoreSubscriptionPayment } from '../../../models/MedicalStoreSubscriptionPayment.js';
import { MedicalStoreSubscriptionNotification } from '../../../models/MedicalStoreSubscriptionNotification.js';
import { SubscriptionPricing } from '../../../models/SubscriptionPricing.js';
import { MedicalStore, STRIPE_CURRENCY, getStripeClient, mapMedicalStoreSessionPayload } from './shared.js';

const STORE_SUBSCRIPTION_PRICING_KEY = 'medical-store-dashboard-subscriptions';
const PAID_PLAN_KEYS = new Set(['gold', 'diamond']);
const PLAN_DURATION_DAYS = 30;

const getDefaultStoreSubscriptionPricing = () => {
  return {
    platinumPriceInRupees: 0,
    goldPriceInRupees: 1499,
    diamondPriceInRupees: 3999
  };
};

const normalizePriceInRupees = (value, fallbackValue) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return Math.max(0, Math.trunc(Number(fallbackValue || 0)));
  return Math.max(0, Math.trunc(numericValue));
};

const mapStoreSubscriptionPricing = (pricingRecord) => {
  const fallbackPricing = getDefaultStoreSubscriptionPricing();
  return {
    platinumPriceInRupees: normalizePriceInRupees(pricingRecord?.platinumPriceInRupees, fallbackPricing.platinumPriceInRupees),
    goldPriceInRupees: normalizePriceInRupees(pricingRecord?.goldPriceInRupees, fallbackPricing.goldPriceInRupees),
    diamondPriceInRupees: normalizePriceInRupees(pricingRecord?.diamondPriceInRupees, fallbackPricing.diamondPriceInRupees),
    updatedAt: pricingRecord?.updatedAt || null
  };
};

const getPrimaryClientUrl = () => {
  const configuredOrigins = String(process.env.CLIENT_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
  return configuredOrigins[0] || 'http://localhost:5173';
};

const formatPlanLabel = (planValue) => {
  const normalizedPlan = normalizePlanKey(planValue) || 'platinum';
  return normalizedPlan.charAt(0).toUpperCase() + normalizedPlan.slice(1);
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

const resolveEffectiveStorePlan = (storeRecord, now = new Date()) => {
  const storedPlan = normalizePlanKey(storeRecord?.currentPlan) || 'platinum';
  const storedStatus = normalizeSubscriptionStatus(storeRecord?.subscriptionStatus);
  const planExpiryTimestamp = toDateTimestamp(storeRecord?.planExpiresAt);
  const nowTimestamp = now.getTime();

  if (PAID_PLAN_KEYS.has(storedPlan) && storedStatus === 'active' && planExpiryTimestamp > nowTimestamp) {
    return { currentPlan: storedPlan, subscriptionStatus: 'active' };
  }
  if (storedPlan === 'platinum') return { currentPlan: 'platinum', subscriptionStatus: 'active' };
  if (storedStatus === 'cancelled') return { currentPlan: 'platinum', subscriptionStatus: 'cancelled' };
  return { currentPlan: 'platinum', subscriptionStatus: 'expired' };
};

const mapStoreSubscriptionStatus = (storeRecord, now = new Date()) => {
  const effectivePlanState = resolveEffectiveStorePlan(storeRecord, now);
  const planExpiryTimestamp = toDateTimestamp(storeRecord?.planExpiresAt);
  const nowTimestamp = now.getTime();
  const isPaidPlanActive = PAID_PLAN_KEYS.has(effectivePlanState.currentPlan);
  const daysRemaining = isPaidPlanActive ? Math.max(0, Math.ceil((planExpiryTimestamp - nowTimestamp) / (1000 * 60 * 60 * 24))) : 0;

  return {
    currentPlan: effectivePlanState.currentPlan,
    subscriptionStatus: effectivePlanState.subscriptionStatus,
    planActivatedAt: storeRecord?.planActivatedAt || null,
    planExpiresAt: isPaidPlanActive ? storeRecord?.planExpiresAt || null : null,
    planCancelledAt: storeRecord?.planCancelledAt || null,
    lastPlanPaymentAt: storeRecord?.lastPlanPaymentAt || null,
    isPaidPlanActive,
    daysRemaining
  };
};

const expireStorePaidPlanIfNeeded = async (storeRecord, now = new Date()) => {
  if (!storeRecord) return null;
  const storedPlan = normalizePlanKey(storeRecord.currentPlan) || 'platinum';
  const storedStatus = normalizeSubscriptionStatus(storeRecord.subscriptionStatus);
  const planExpiryTimestamp = toDateTimestamp(storeRecord.planExpiresAt);

  if (PAID_PLAN_KEYS.has(storedPlan) && storedStatus === 'active' && planExpiryTimestamp > 0 && planExpiryTimestamp <= now.getTime()) {
    storeRecord.currentPlan = 'platinum';
    storeRecord.subscriptionStatus = 'expired';
    storeRecord.planCancelledAt = now;
    await storeRecord.save();
    
    await MedicalStoreSubscriptionNotification.create({
      storeId: storeRecord._id,
      eventType: 'plan_expired',
      title: `${formatPlanLabel(storedPlan)} plan expired`,
      message: `Your ${formatPlanLabel(storedPlan)} plan has expired. You are now on the Platinum plan.`,
      meta: { previousPlan: storedPlan, expiredAt: now }
    }).catch(() => {});
  }
  return storeRecord;
};

const resolveCheckoutAction = (storeRecord, requestedPlan, now = new Date()) => {
  const effectivePlanState = resolveEffectiveStorePlan(storeRecord, now);
  if (!PAID_PLAN_KEYS.has(requestedPlan)) return '';
  if (!PAID_PLAN_KEYS.has(effectivePlanState.currentPlan)) return 'buy';
  if (effectivePlanState.currentPlan === requestedPlan) return 'renew';
  return 'update';
};

const getPriceForPlan = (pricingRecord, plan) => {
  const mappedPricing = mapStoreSubscriptionPricing(pricingRecord);
  if (plan === 'gold') return mappedPricing.goldPriceInRupees;
  if (plan === 'diamond') return mappedPricing.diamondPriceInRupees;
  return 0;
};

const getOrCreateStoreSubscriptionPricing = async () => {
  const fallbackPricing = getDefaultStoreSubscriptionPricing();
  return SubscriptionPricing.findOneAndUpdate(
    { key: STORE_SUBSCRIPTION_PRICING_KEY },
    { $setOnInsert: { key: STORE_SUBSCRIPTION_PRICING_KEY, ...fallbackPricing } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const getStripeCustomerIdForStore = async (storeRecord, stripeClient) => {
  const existingId = String(storeRecord?.stripeCustomerId || '').trim();
  if (existingId) return existingId;

  const customer = await stripeClient.customers.create({
    email: String(storeRecord?.email || '').trim().toLowerCase(),
    name: String(storeRecord?.name || '').trim() || 'Medical Store',
    metadata: { storeId: String(storeRecord?._id || '') }
  });
  storeRecord.stripeCustomerId = customer.id;
  await storeRecord.save();
  return customer.id;
};

export const getStoreSubscriptionPricing = async (req, res) => {
  try {
    const pricingRecord = await getOrCreateStoreSubscriptionPricing();
    return res.status(200).json({ pricing: mapStoreSubscriptionPricing(pricingRecord), currency: STRIPE_CURRENCY });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch store subscription pricing', error: error.message });
  }
};

export const getStoreSubscriptionStatus = async (req, res) => {
  try {
    const store = await MedicalStore.findById(req.user?.id);
    if (!store) return res.status(404).json({ message: 'Store not found' });
    await expireStorePaidPlanIfNeeded(store);
    return res.status(200).json({ subscription: mapStoreSubscriptionStatus(store), store: mapMedicalStoreSessionPayload(store) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch store subscription status', error: error.message });
  }
};

export const createStoreSubscriptionCheckoutSession = async (req, res) => {
  try {
    const selectedPlan = normalizePlanKey(req.body?.plan);
    if (!PAID_PLAN_KEYS.has(selectedPlan)) return res.status(400).json({ message: 'Please select a valid paid plan (gold or diamond)' });

    const store = await MedicalStore.findById(req.user?.id);
    if (!store) return res.status(404).json({ message: 'Store not found' });

    const now = new Date();
    await expireStorePaidPlanIfNeeded(store, now);

    const pricingRecord = await getOrCreateStoreSubscriptionPricing();
    const amountInRupees = getPriceForPlan(pricingRecord, selectedPlan);
    if (!amountInRupees || amountInRupees <= 0) return res.status(400).json({ message: 'Plan pricing not configured.' });

    const action = resolveCheckoutAction(store, selectedPlan, now);
    if (!action) return res.status(400).json({ message: 'Could not resolve purchase action' });

    const stripeClient = getStripeClient();
    const customerId = await getStripeCustomerIdForStore(store, stripeClient);
    const clientBaseUrl = getPrimaryClientUrl();
    const successUrl = `${clientBaseUrl}/store/dashboard/subscriptions?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${clientBaseUrl}/store/dashboard/subscriptions?checkout=cancelled`;

    const checkoutSession = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: STRIPE_CURRENCY,
          unit_amount: amountInRupees * 100,
          product_data: {
            name: `${selectedPlan.charAt(0).toUpperCase()}${selectedPlan.slice(1)} Plan`,
            description: `${PLAN_DURATION_DAYS}-day medical store subscription plan`
          }
        }
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { storeId: String(store._id), plan: selectedPlan, action, amountInRupees: String(amountInRupees) },
      client_reference_id: String(store._id)
    });

    return res.status(200).json({ checkoutUrl: checkoutSession.url, sessionId: checkoutSession.id, plan: selectedPlan, action, amountInRupees });
  } catch (error) {
    return res.status(500).json({ message: 'Could not create stripe session', error: error.message });
  }
};

export const confirmStoreSubscriptionCheckoutSession = async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ message: 'Session ID is required' });

    const store = await MedicalStore.findById(req.user?.id);
    if (!store) return res.status(404).json({ message: 'Store not found' });
    await expireStorePaidPlanIfNeeded(store);

    const existingPayment = await MedicalStoreSubscriptionPayment.findOne({ stripeCheckoutSessionId: sessionId, status: 'succeeded' }).lean();
    if (existingPayment) return res.status(200).json({ message: 'Payment already confirmed', subscription: mapStoreSubscriptionStatus(store), store: mapMedicalStoreSessionPayload(store) });

    const stripeClient = getStripeClient();
    const checkoutSession = await stripeClient.checkout.sessions.retrieve(sessionId);
    if (!checkoutSession || checkoutSession.metadata.storeId !== String(store._id) || checkoutSession.payment_status !== 'paid') {
      return res.status(400).json({ message: 'Invalid or unpaid session' });
    }

    const selectedPlan = normalizePlanKey(checkoutSession.metadata.plan);
    const action = checkoutSession.metadata.action;
    const amountInRupees = Number(checkoutSession.metadata.amountInRupees);
    const purchaseDate = new Date(checkoutSession.created * 1000);

    const previousPlanExpiry = toDateTimestamp(store.planExpiresAt);
    const isRenewal = action === 'renew' && store.currentPlan === selectedPlan && store.subscriptionStatus === 'active' && previousPlanExpiry > purchaseDate.getTime();
    const renewalBaseDate = isRenewal ? new Date(previousPlanExpiry) : purchaseDate;
    const nextExpiryDate = addDays(renewalBaseDate, PLAN_DURATION_DAYS);

    store.currentPlan = selectedPlan;
    store.subscriptionStatus = 'active';
    store.planActivatedAt = isRenewal ? (store.planActivatedAt || purchaseDate) : purchaseDate;
    store.planExpiresAt = nextExpiryDate;
    store.planCancelledAt = null;
    store.lastPlanPaymentAt = purchaseDate;
    store.lastPlanCheckoutSessionId = sessionId;
    store.lastPlanPaymentIntentId = checkoutSession.payment_intent;
    if (checkoutSession.customer) store.stripeCustomerId = checkoutSession.customer;
    await store.save();

    const planLabel = formatPlanLabel(selectedPlan);
    await MedicalStoreSubscriptionNotification.create({
      storeId: store._id,
      eventType: action === 'renew' ? 'plan_renewed' : action === 'update' ? 'plan_updated' : 'plan_bought',
      title: `${planLabel} plan ${action === 'renew' ? 'renewed' : action === 'update' ? 'updated' : 'activated'}`,
      message: `Your ${planLabel} plan is active until ${nextExpiryDate.toLocaleDateString()}.`,
      meta: { plan: selectedPlan, action, amountInRupees, expiresAt: nextExpiryDate, stripeCheckoutSessionId: sessionId }
    }).catch(() => {});

    await MedicalStoreSubscriptionPayment.create({
      storeId: store._id,
      storeName: store.name,
      storeEmail: store.email,
      plan: selectedPlan,
      action,
      amountInRupees,
      currency: checkoutSession.currency || 'pkr',
      status: 'succeeded',
      purchasedAt: purchaseDate,
      expiresAt: nextExpiryDate,
      stripeCheckoutSessionId: sessionId,
      stripePaymentIntentId: checkoutSession.payment_intent,
      stripeCustomerId: checkoutSession.customer
    }).catch(() => {});

    return res.status(200).json({ message: `${planLabel} plan activated successfully`, subscription: mapStoreSubscriptionStatus(store), store: mapMedicalStoreSessionPayload(store) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not confirm payment', error: error.message });
  }
};

export const cancelStoreSubscription = async (req, res) => {
  try {
    const store = await MedicalStore.findById(req.user?.id);
    if (!store) return res.status(404).json({ message: 'Store not found' });
    await expireStorePaidPlanIfNeeded(store);

    if (!PAID_PLAN_KEYS.has(store.currentPlan)) return res.status(200).json({ message: 'Already on Platinum', subscription: mapStoreSubscriptionStatus(store), store: mapMedicalStoreSessionPayload(store) });

    const prevPlan = store.currentPlan;
    store.currentPlan = 'platinum';
    store.subscriptionStatus = 'cancelled';
    store.planCancelledAt = new Date();
    store.planExpiresAt = new Date();
    await store.save();

    const label = formatPlanLabel(prevPlan);
    await MedicalStoreSubscriptionNotification.create({
      storeId: store._id,
      eventType: 'plan_cancelled',
      title: `${label} plan cancelled`,
      message: `Your ${label} plan has been cancelled. You are now on the Platinum plan.`,
      meta: { previousPlan: prevPlan, cancelledAt: store.planCancelledAt }
    }).catch(() => {});

    return res.status(200).json({ message: 'Subscription cancelled. switched to Platinum plan.', subscription: mapStoreSubscriptionStatus(store), store: mapMedicalStoreSessionPayload(store) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not cancel', error: error.message });
  }
};
