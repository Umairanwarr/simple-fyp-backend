import { CampaignPromotion } from '../models/CampaignPromotion.js';
import { Clinic } from '../models/Clinic.js';
import { Doctor } from '../models/Doctor.js';
import { MedicalStore } from '../models/MedicalStore.js';
import { SubscriptionPricing } from '../models/SubscriptionPricing.js';
import { STRIPE_CURRENCY, getStripeClient } from '../services/stripeService.js';
import { mapDoctorForPatientDirectory, mapMedicalStoreForPatientDirectory } from './auth/patient/shared.js';

const CAMPAIGN_PRICING_KEY = 'campaign-promotion-pricing';
const MIN_PROMOTION_RATING = 3.5;

const DEFAULT_CAMPAIGN_PLANS = [
  { id: 'starter', name: 'Starter Boost', priceInRupees: 999, durationDays: 7, isActive: true },
  { id: 'growth', name: 'Growth Boost', priceInRupees: 2499, durationDays: 15, isActive: true },
  { id: 'premium', name: 'Premium Boost', priceInRupees: 4499, durationDays: 30, isActive: true }
];

const getPrimaryClientUrl = () => {
  const configuredOrigins = String(process.env.CLIENT_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
  return configuredOrigins[0] || 'http://localhost:5173';
};

const toDateTimestamp = (dateValue) => {
  const parsedDate = dateValue ? new Date(dateValue) : null;
  return !parsedDate || Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
};

const addDays = (baseDate, daysCount) => {
  const start = new Date(toDateTimestamp(baseDate) || Date.now());
  start.setDate(start.getDate() + Math.max(1, Math.trunc(Number(daysCount || 1))));
  return start;
};

const normalizeCampaignPlan = (plan, index = 0) => {
  const fallbackPlan = DEFAULT_CAMPAIGN_PLANS[index] || DEFAULT_CAMPAIGN_PLANS[0];
  const id = String(plan?.id || fallbackPlan.id || `plan-${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const name = String(plan?.name || fallbackPlan.name || `Campaign Plan ${index + 1}`).trim();
  const priceInRupees = Math.max(0, Math.trunc(Number(plan?.priceInRupees ?? fallbackPlan.priceInRupees ?? 0)));
  const durationDays = Math.max(1, Math.trunc(Number(plan?.durationDays ?? fallbackPlan.durationDays ?? 1)));

  return {
    id,
    name,
    priceInRupees,
    durationDays,
    isActive: plan?.isActive === false ? false : true
  };
};

const mapCampaignPricing = (pricingRecord) => {
  const rawPlans = Array.isArray(pricingRecord?.campaignPlans) && pricingRecord.campaignPlans.length > 0
    ? pricingRecord.campaignPlans
    : DEFAULT_CAMPAIGN_PLANS;

  return {
    campaignPlans: rawPlans.map((plan, index) => normalizeCampaignPlan(plan, index)),
    updatedAt: pricingRecord?.updatedAt || null
  };
};

const getOrCreateCampaignPricing = async () => {
  return SubscriptionPricing.findOneAndUpdate(
    { key: CAMPAIGN_PRICING_KEY },
    { $setOnInsert: { key: CAMPAIGN_PRICING_KEY, campaignPlans: DEFAULT_CAMPAIGN_PLANS } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const expireCampaignsIfNeeded = async (now = new Date()) => {
  await CampaignPromotion.updateMany(
    { status: 'active', expiresAt: { $lte: now } },
    { $set: { status: 'expired' } }
  );
};

const resolveAccount = async (role, accountId) => {
  if (role === 'doctor') {
    const account = await Doctor.findById(accountId).select('fullName email phone specialization address avatarDocument averageRating totalReviews stripeCustomerId applicationStatus emailVerified').exec();
    return account ? { role, account, idField: 'doctorId', name: account.fullName, email: account.email, phone: account.phone } : null;
  }

  if (role === 'medical-store') {
    const account = await MedicalStore.findById(accountId).select('name email phone address avatarDocument averageRating totalReviews stripeCustomerId applicationStatus emailVerified currentPlan').exec();
    return account ? { role, account, idField: 'storeId', name: account.name, email: account.email, phone: account.phone } : null;
  }

  if (role === 'clinic') {
    const account = await Clinic.findById(accountId).select('name email phone address facilityType avatarDocument averageRating totalReviews stripeCustomerId applicationStatus emailVerified').exec();
    return account ? { role, account, idField: 'clinicId', name: account.name, email: account.email, phone: account.phone } : null;
  }

  return null;
};

const getStripeCustomerIdForAccount = async (resolvedAccount, stripeClient) => {
  const existingCustomerId = String(resolvedAccount?.account?.stripeCustomerId || '').trim();
  if (existingCustomerId) return existingCustomerId;

  const customer = await stripeClient.customers.create({
    email: String(resolvedAccount.email || '').trim().toLowerCase(),
    name: String(resolvedAccount.name || '').trim() || 'Promoted Account',
    metadata: {
      accountRole: resolvedAccount.role,
      accountId: String(resolvedAccount.account?._id || '')
    }
  });

  resolvedAccount.account.stripeCustomerId = String(customer?.id || '').trim();
  await resolvedAccount.account.save();
  return resolvedAccount.account.stripeCustomerId;
};

const mapActivePromotion = (promotion, now = new Date()) => {
  if (!promotion || promotion.status !== 'active' || toDateTimestamp(promotion.expiresAt) <= now.getTime()) return null;

  return {
    id: String(promotion._id || ''),
    accountRole: promotion.accountRole,
    planId: promotion.planId,
    planName: promotion.planName,
    amountInRupees: promotion.amountInRupees,
    durationDays: promotion.durationDays,
    activatedAt: promotion.activatedAt || null,
    expiresAt: promotion.expiresAt || null,
    daysRemaining: Math.max(0, Math.ceil((toDateTimestamp(promotion.expiresAt) - now.getTime()) / (1000 * 60 * 60 * 24)))
  };
};

const getRoleDashboardPath = (role) => {
  if (role === 'medical-store') return '/store/dashboard/subscriptions';
  if (role === 'clinic') return '/clinic/dashboard/subscriptions';
  return '/doctor/dashboard/campaign';
};

const getAccountPromotionFilter = (role, accountId) => {
  if (role === 'medical-store') return { accountRole: role, storeId: accountId };
  if (role === 'clinic') return { accountRole: role, clinicId: accountId };
  return { accountRole: role, doctorId: accountId };
};

const normalizeStorePlan = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['platinum', 'gold', 'diamond'].includes(normalized) ? normalized : 'platinum';
};

const isStoreCampaignEligiblePlan = (storePlan) => {
  const normalizedPlan = normalizeStorePlan(storePlan);
  return normalizedPlan === 'platinum' || normalizedPlan === 'gold' || normalizedPlan === 'diamond';
};
const isDiamondPlanActive = (accountRecord) => {
  const plan = String(accountRecord?.currentPlan || '').trim().toLowerCase();
  const status = String(accountRecord?.subscriptionStatus || '').trim().toLowerCase();
  const expiryTimestamp = accountRecord?.planExpiresAt ? new Date(accountRecord.planExpiresAt).getTime() : 0;
  return plan === 'diamond' && status === 'active' && expiryTimestamp > Date.now();
};

export const getCampaignPricing = async (req, res) => {
  try {
    const pricingRecord = await getOrCreateCampaignPricing();
    return res.status(200).json({ pricing: mapCampaignPricing(pricingRecord), currency: STRIPE_CURRENCY });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch campaign pricing', error: error.message });
  }
};

export const updateCampaignPricingForAdmin = async (req, res) => {
  try {
    const incomingPlans = Array.isArray(req.body?.campaignPlans) ? req.body.campaignPlans : [];
    if (incomingPlans.length === 0) return res.status(400).json({ message: 'At least one campaign plan is required' });

    const normalizedPlans = incomingPlans.slice(0, 6).map((plan, index) => normalizeCampaignPlan(plan, index));
    const hasInvalidPlan = normalizedPlans.some((plan) => !plan.id || !plan.name || plan.priceInRupees <= 0 || plan.durationDays <= 0);
    if (hasInvalidPlan) return res.status(400).json({ message: 'Each active campaign plan needs a name, price, and days' });

    const pricingRecord = await SubscriptionPricing.findOneAndUpdate(
      { key: CAMPAIGN_PRICING_KEY },
      {
        $set: {
          key: CAMPAIGN_PRICING_KEY,
          campaignPlans: normalizedPlans,
          updatedByAdminId: req.user?.id || null
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ pricing: mapCampaignPricing(pricingRecord) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update campaign pricing', error: error.message });
  }
};

export const getCampaignStatus = async (req, res) => {
  try {
    await expireCampaignsIfNeeded();
    const role = String(req.user?.role || '').trim();
    const accountId = req.user?.id;
    if (role === 'medical-store') {
      const store = await MedicalStore.findById(accountId).select('currentPlan').lean();
      if (!store) return res.status(404).json({ message: 'Store not found' });
      if (!isStoreCampaignEligiblePlan(store.currentPlan)) {
        return res.status(200).json({ promotion: null, isCampaignLocked: true, requiredPlans: ['gold', 'diamond'] });
      }
    }

    const activePromotion = await CampaignPromotion.findOne({
      ...getAccountPromotionFilter(role, accountId),
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).sort({ expiresAt: -1 }).lean();

    return res.status(200).json({ promotion: mapActivePromotion(activePromotion) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch campaign status', error: error.message });
  }
};

export const createCampaignCheckoutSession = async (req, res) => {
  try {
    const role = String(req.user?.role || '').trim();
    const accountId = req.user?.id;
    const requestedPlanId = String(req.body?.planId || '').trim().toLowerCase();

    const resolvedAccount = await resolveAccount(role, accountId);
    if (!resolvedAccount) return res.status(404).json({ message: 'Account not found' });
    if (role === 'medical-store' && !isStoreCampaignEligiblePlan(resolvedAccount.account?.currentPlan)) {
      return res.status(403).json({ message: 'Campaigns are available on Gold and Diamond store plans only' });
    }

    if (String(resolvedAccount.account?.applicationStatus || '').trim().toLowerCase() === 'declined' || !resolvedAccount.account?.emailVerified) {
      return res.status(403).json({ message: 'Only verified and approved accounts can create campaigns' });
    }

    const averageRating = Number(resolvedAccount.account?.averageRating || 0);
    if (!Number.isFinite(averageRating) || averageRating <= MIN_PROMOTION_RATING) {
      return res.status(403).json({ message: 'Increase your rating above 3.5 to promote your profile' });
    }

    const pricingRecord = await getOrCreateCampaignPricing();
    const pricing = mapCampaignPricing(pricingRecord);
    const selectedPlan = pricing.campaignPlans.find((plan) => plan.id === requestedPlanId && plan.isActive);
    if (!selectedPlan) return res.status(400).json({ message: 'Please select a valid campaign plan' });
    if (selectedPlan.priceInRupees <= 0) return res.status(400).json({ message: 'Campaign plan pricing is not configured' });

    const stripeClient = getStripeClient();
    const stripeCustomerId = await getStripeCustomerIdForAccount(resolvedAccount, stripeClient);
    const clientBaseUrl = getPrimaryClientUrl();
    const dashboardPath = getRoleDashboardPath(role);

    const checkoutSession = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      customer: stripeCustomerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: STRIPE_CURRENCY,
            unit_amount: selectedPlan.priceInRupees * 100,
            product_data: {
              name: `${selectedPlan.name} Campaign`,
              description: `${selectedPlan.durationDays}-day sponsored placement`
            }
          }
        }
      ],
      success_url: `${clientBaseUrl}${dashboardPath}?campaign_checkout=success&campaign_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientBaseUrl}${dashboardPath}?campaign_checkout=cancelled`,
      metadata: {
        campaignType: 'sponsored_profile',
        accountRole: role,
        accountId: String(accountId || ''),
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        amountInRupees: String(selectedPlan.priceInRupees),
        durationDays: String(selectedPlan.durationDays)
      },
      client_reference_id: String(accountId || '')
    });

    return res.status(200).json({ checkoutUrl: checkoutSession?.url || '', sessionId: checkoutSession?.id || '', plan: selectedPlan });
  } catch (error) {
    return res.status(500).json({ message: 'Could not create campaign checkout session', error: error.message });
  }
};

export const confirmCampaignCheckoutSession = async (req, res) => {
  try {
    const role = String(req.user?.role || '').trim();
    const accountId = String(req.user?.id || '').trim();
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ message: 'Stripe checkout session id is required' });

    await expireCampaignsIfNeeded();

    const existingPromotion = await CampaignPromotion.findOne({ stripeCheckoutSessionId: sessionId }).lean();
    if (existingPromotion) return res.status(200).json({ message: 'Campaign payment already confirmed', promotion: mapActivePromotion(existingPromotion) });

    const stripeClient = getStripeClient();
    const checkoutSession = await stripeClient.checkout.sessions.retrieve(sessionId);
    if (!checkoutSession) return res.status(404).json({ message: 'Stripe checkout session not found' });
    if (String(checkoutSession?.payment_status || '').toLowerCase() !== 'paid') return res.status(400).json({ message: 'Payment is not completed yet' });
    if (String(checkoutSession?.metadata?.accountRole || '') !== role || String(checkoutSession?.metadata?.accountId || '') !== accountId) {
      return res.status(403).json({ message: 'This campaign checkout session does not belong to you' });
    }

    const resolvedAccount = await resolveAccount(role, accountId);
    if (!resolvedAccount) return res.status(404).json({ message: 'Account not found' });
    if (role === 'medical-store' && !isStoreCampaignEligiblePlan(resolvedAccount.account?.currentPlan)) {
      return res.status(403).json({ message: 'Campaigns are available on Gold and Diamond store plans only' });
    }

    const amountInRupees = Math.max(0, Math.trunc(Number(checkoutSession?.metadata?.amountInRupees || checkoutSession?.amount_total / 100 || 0)));
    const durationDays = Math.max(1, Math.trunc(Number(checkoutSession?.metadata?.durationDays || 1)));
    const purchaseDate = Number.isFinite(Number(checkoutSession?.created)) ? new Date(Number(checkoutSession.created) * 1000) : new Date();

    const previousPromotion = await CampaignPromotion.findOne({
      ...getAccountPromotionFilter(role, accountId),
      status: 'active',
      expiresAt: { $gt: purchaseDate }
    }).sort({ expiresAt: -1 }).lean();
    const baseDate = previousPromotion?.expiresAt || purchaseDate;
    const expiresAt = addDays(baseDate, durationDays);

    const promotionPayload = {
      accountRole: role,
      doctorId: role === 'doctor' ? accountId : null,
      storeId: role === 'medical-store' ? accountId : null,
      clinicId: role === 'clinic' ? accountId : null,
      accountName: String(resolvedAccount.name || '').trim() || 'Promoted Account',
      accountEmail: String(resolvedAccount.email || '').trim().toLowerCase(),
      accountPhone: String(resolvedAccount.phone || '').trim(),
      planId: String(checkoutSession?.metadata?.planId || '').trim(),
      planName: String(checkoutSession?.metadata?.planName || 'Campaign').trim(),
      amountInRupees,
      durationDays,
      status: 'active',
      activatedAt: purchaseDate,
      expiresAt,
      stripeCheckoutSessionId: sessionId,
      stripePaymentIntentId: String(checkoutSession?.payment_intent || '').trim(),
      stripeCustomerId: String(checkoutSession?.customer || '').trim()
    };

    const promotion = await CampaignPromotion.create(promotionPayload);
    return res.status(200).json({ message: 'Campaign activated successfully', promotion: mapActivePromotion(promotion) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({ message: 'Campaign payment already confirmed' });
    }
    return res.status(500).json({ message: 'Could not confirm campaign payment', error: error.message });
  }
};

export const getPromotedAccountsForAdmin = async (req, res) => {
  try {
    await expireCampaignsIfNeeded();
    const now = new Date();
    const promotions = await CampaignPromotion.find({})
      .sort({ status: 1, expiresAt: -1, createdAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({
      promotedAccounts: promotions.map((promotion) => ({
        id: String(promotion._id || ''),
        accountId: String(promotion.doctorId || promotion.storeId || promotion.clinicId || ''),
        accountRole: promotion.accountRole,
        accountName: promotion.accountName,
        accountEmail: promotion.accountEmail,
        accountPhone: promotion.accountPhone,
        planName: promotion.planName,
        amountInRupees: promotion.amountInRupees,
        durationDays: promotion.durationDays,
        status: promotion.status,
        activatedAt: promotion.activatedAt || null,
        expiresAt: promotion.expiresAt || null,
        daysRemaining: promotion.status === 'active' ? Math.max(0, Math.ceil((toDateTimestamp(promotion.expiresAt) - now.getTime()) / (1000 * 60 * 60 * 24))) : 0
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch promoted accounts', error: error.message });
  }
};

export const getSponsoredAccountsForPatients = async (req, res) => {
  try {
    await expireCampaignsIfNeeded();
    const promotions = await CampaignPromotion.find({ status: 'active', expiresAt: { $gt: new Date() } })
      .sort({ expiresAt: -1, createdAt: -1 })
      .limit(80)
      .lean();

    const doctorIds = promotions.filter((promotion) => promotion.accountRole === 'doctor' && promotion.doctorId).map((promotion) => promotion.doctorId);
    const storeIds = promotions.filter((promotion) => promotion.accountRole === 'medical-store' && promotion.storeId).map((promotion) => promotion.storeId);
    const clinicIds = promotions.filter((promotion) => promotion.accountRole === 'clinic' && promotion.clinicId).map((promotion) => promotion.clinicId);

    const [doctors, stores, clinics] = await Promise.all([
      Doctor.find({ _id: { $in: doctorIds }, applicationStatus: { $ne: 'declined' }, emailVerified: true }).select('fullName specialization address avatarDocument availabilitySlots averageRating totalReviews').lean(),
      MedicalStore.find({ _id: { $in: storeIds }, applicationStatus: 'approved', emailVerified: true }).select('name address operatingHours avatarDocument averageRating totalReviews currentPlan subscriptionStatus planExpiresAt').lean(),
      Clinic.find({ _id: { $in: clinicIds }, applicationStatus: { $ne: 'declined' }, emailVerified: true }).select('name address facilityType avatarDocument averageRating totalReviews currentPlan subscriptionStatus planExpiresAt').lean()
    ]);

    const doctorById = new Map(doctors.map((doctor) => [String(doctor._id), doctor]));
    const storeById = new Map(stores.map((store) => [String(store._id), store]));
    const clinicById = new Map(clinics.map((clinic) => [String(clinic._id), clinic]));
    const seen = new Set();

    const sponsored = promotions.map((promotion) => {
      const key = `${promotion.accountRole}-${String(promotion.doctorId || promotion.storeId || promotion.clinicId || '')}`;
      if (seen.has(key)) return null;
      seen.add(key);

      if (promotion.accountRole === 'doctor') {
        const doctor = doctorById.get(String(promotion.doctorId));
        return doctor ? { ...mapDoctorForPatientDirectory(doctor), isSponsored: true } : null;
      }

      if (promotion.accountRole === 'medical-store') {
        const store = storeById.get(String(promotion.storeId));
        return store ? { ...mapMedicalStoreForPatientDirectory(store), isSponsored: true } : null;
      }

      const clinic = clinicById.get(String(promotion.clinicId));
      if (!clinic) return null;
      const rating = Number(clinic.averageRating || 0);
      const totalReviews = Math.max(0, Math.trunc(Number(clinic.totalReviews || 0)));
      return {
        id: String(clinic._id),
        name: String(clinic.name || '').trim() || 'Clinic',
        specialty: String(clinic.facilityType || '').trim() || 'General Clinic',
        specialtyTag: 'Clinic',
        rating: rating > 0 ? rating.toFixed(2) : '0.00',
        reviews: `${totalReviews} review${totalReviews === 1 ? '' : 's'}`,
        location: String(clinic.address || '').trim() || 'Location not provided',
        image: String(clinic.avatarDocument?.url || '').trim() || '/clinic-placeholder.svg',
        type: 'clinic',
        isSponsored: true,
        isVerifiedBadge: isDiamondPlanActive(clinic),
        hasPrioritySupport: isDiamondPlanActive(clinic)
      };
    }).filter(Boolean).slice(0, 12);

    return res.status(200).json({ sponsored });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch sponsored accounts', error: error.message });
  }
};
