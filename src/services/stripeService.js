import Stripe from 'stripe';

let stripeClient = null;

export const getStripeClient = () => {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();

  if (!secretKey) {
    throw new Error('Stripe secret key is not configured');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
};

export const STRIPE_CURRENCY = String(process.env.STRIPE_CURRENCY || 'pkr').trim().toLowerCase();
