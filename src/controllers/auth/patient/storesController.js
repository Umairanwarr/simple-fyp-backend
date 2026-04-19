import {
  MedicalStore,
  Patient,
  escapeRegex,
  mapMedicalStoreForPatientDirectory,
  mongoose
} from './shared.js';
import { Medicine } from '../../../models/Medicine.js';
import { StoreOrder } from '../../../models/StoreOrder.js';
import { StoreOrderNotification } from '../../../models/StoreOrderNotification.js';
import { DoctorMedia } from '../../../models/DoctorMedia.js';
import {
  sendStoreOrderPlacedEmail,
  sendStoreNewOrderEmail
} from '../../../services/mailService.js';
import { getStripeClient, STRIPE_CURRENCY } from '../../../services/stripeService.js';

export const searchStoresForPatients = async (req, res) => {
  try {
    const rawQuery = String(req.query?.q || req.query?.query || '').trim();
    const queryTokens = rawQuery
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    const filters = {
      applicationStatus: 'approved',
      emailVerified: true
    };

    const stores = await MedicalStore.find(filters)
      .select('name licenseNumber address operatingHours avatarDocument bio')
      .sort({ updatedAt: -1 })
      .limit(250)
      .lean();

    const filteredStores = queryTokens.length === 0
      ? stores
      : stores.filter((store) => {
          const searchableText = [
            store.name,
            store.address,
            store.licenseNumber,
            store.bio
          ]
            .join(' ')
            .toLowerCase();

          return queryTokens.some((token) => searchableText.includes(token));
        });

    return res.status(200).json({
      stores: filteredStores.map((store) => mapMedicalStoreForPatientDirectory(store))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch stores for search', error: error.message });
  }
};

export const getStoreProfileForPatient = async (req, res) => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ message: 'Invalid store id' });
    }

    const store = await MedicalStore.findOne({
      _id: storeId,
      applicationStatus: 'approved',
      emailVerified: true
    })
      .select('name licenseNumber address operatingHours avatarDocument bio phone reviews averageRating totalReviews')
      .lean();

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const medicines = await Medicine.find({
      storeId: storeId,
      status: 'In Stock'
    })
      .select('name brand price stock category description status')
      .sort({ name: 1 })
      .lean();

    const media = await DoctorMedia.find({
      storeId: storeId,
      uploaderRole: 'medical-store',
      moderationStatus: 'approved',
      deletedAt: null
    })
      .select('asset mediaType createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const storeData = mapMedicalStoreForPatientDirectory(store);

    return res.status(200).json({
      store: {
        ...storeData,
        phone: String(store.phone || '').trim(),
        rating: Number(store.averageRating || 0).toFixed(2),
        reviews: Number(store.totalReviews || 0),
        bio: String(store.bio || '').trim()
      },
      inventory: medicines.map((med) => ({
        id: String(med._id),
        name: String(med.name || '').trim(),
        brand: String(med.brand || '').trim(),
        price: Number(med.price) || 0,
        stock: Number(med.stock) || 0,
        category: String(med.category || '').trim(),
        description: String(med.description || '').trim(),
        status: med.status || 'In Stock'
      })),
      gallery: media.map((m) => ({
        id: String(m._id),
        url: m.asset?.url,
        type: m.mediaType,
        createdAt: m.createdAt
      })),
      reviewsList: (store.reviews || []).map(r => ({
        id: String(r._id),
        patientName: r.patientName,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not load store profile', error: error.message });
  }
};

export const createStoreOrder = async (req, res) => {
  try {
    const { storeId } = req.params;
    const patientId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ message: 'Invalid store id' });
    }

    const patient = await Patient.findById(patientId)
      .select('firstName lastName email phone avatarUrl profileImage image')
      .lean();

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const store = await MedicalStore.findOne({
      _id: storeId,
      applicationStatus: 'approved',
      emailVerified: true
    })
      .select('_id name')
      .lean();

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const {
      items,
      notes = '',
      paymentMethod = 'cod',
      prescriptionUrl,
      prescriptionPublicId,
      prescriptionResourceType,
      prescriptionFormat,
      prescriptionOriginalName
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Selected medicines are required' });
    }

    if (!prescriptionUrl || !prescriptionPublicId) {
      return res.status(400).json({ message: 'A valid prescription is required to place an order' });
    }

    if (!['stripe', 'cod'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Invalid payment method. Choose stripe or cod' });
    }

    // Process items, calculate total, check and deduct stock
    let totalAmount = 0;
    const orderItems = [];

    // Use a loop to validate and deduct
    for (const item of items) {
      const medicine = await Medicine.findOne({ _id: item.id, storeId });
      if (!medicine) {
        return res.status(400).json({ message: `Medicine not found for ID: ${item.id}` });
      }

      const q = Math.max(1, Number(item.quantity) || 1);
      if (medicine.stock < q) {
        return res.status(400).json({ message: `Insufficient stock for: ${medicine.name}` });
      }

      totalAmount += (Number(medicine.price || 0) * q);
      orderItems.push({
        medicineId: medicine._id,
        name: medicine.name,
        quantity: q,
        price: medicine.price
      });

      // Deduct stock
      medicine.stock -= q;
      if (medicine.stock <= 0) {
        medicine.stock = 0;
        medicine.status = 'Out of Stock';
      }
      await medicine.save();
    }

    const patientName = `${String(patient.firstName || '').trim()} ${String(patient.lastName || '').trim()}`.trim() || 'Patient';
    const patientPhone = String(patient.phone || '').trim();
    const patientEmail = String(patient.email || '').trim();
    const patientImage = String(patient.avatarUrl || patient.profileImage || patient.image || '').trim();

    // For Stripe, create a payment intent
    let stripePaymentIntentId = null;
    let stripeClientSecret = null;

    if (paymentMethod === 'stripe') {
      try {
        const stripe = getStripeClient();
        const intent = await stripe.paymentIntents.create({
          amount: totalAmount * 100,
          currency: STRIPE_CURRENCY,
          payment_method_types: ['card'],
          metadata: { storeId, patientId: String(patientId) }
        });
        stripePaymentIntentId = intent.id;
        stripeClientSecret = intent.client_secret;
      } catch (stripeError) {
        return res.status(500).json({ message: 'Could not initialize Stripe payment', error: stripeError.message });
      }
    }

    const order = await StoreOrder.create({
      storeId,
      patientId,
      patientName,
      patientPhone,
      patientEmail,
      patientImage,
      items: orderItems,
      totalAmount,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
      stripePaymentIntentId,
      notes: String(notes || '').trim(),
      prescriptions: [{
        url: prescriptionUrl,
        publicId: prescriptionPublicId,
        resourceType: prescriptionResourceType || 'image',
        format: prescriptionFormat || null,
        originalName: prescriptionOriginalName || null
      }],
      status: 'pending'
    });

    // Create in-app notification for the store (bell icon)
    const storeForEmail = await MedicalStore.findById(storeId).select('name email').lean();
    StoreOrderNotification.create({
      storeId,
      orderId: order._id,
      eventType: 'order_placed',
      title: 'New Order Received',
      message: `${patientName} placed a new order for ${orderItems.length} item${orderItems.length !== 1 ? 's' : ''} · Rs ${totalAmount.toLocaleString()}`,
      meta: { patientName, totalAmount, itemCount: orderItems.length }
    }).catch(console.error);

    if (patientEmail) {
      sendStoreOrderPlacedEmail({
        to: patientEmail,
        patientName,
        storeName: storeForEmail?.name || store.name,
        items: orderItems,
        totalAmount,
        paymentMethod,
        orderId: String(order._id)
      }).catch(console.error);
    }

    if (storeForEmail?.email) {
      sendStoreNewOrderEmail({
        to: storeForEmail.email,
        storeName: storeForEmail.name,
        patientName,
        items: orderItems,
        totalAmount,
        orderId: String(order._id)
      }).catch(console.error);
    }

    return res.status(201).json({
      message: 'Order placed successfully',
      orderId: String(order._id),
      totalAmount,
      stripeClientSecret
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not place order', error: error.message });
  }
};

export const getPatientStoreOrders = async (req, res) => {
  try {
    const patientId = req.user?.id;

    if (!patientId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const orders = await StoreOrder.find({ patientId })
      .populate('storeId', 'name address avatarDocument phone')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ orders });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch orders', error: error.message });
  }
};

// ─── Get the first completed order that still needs a review ───
export const getPendingStoreReviewOrder = async (req, res) => {
  try {
    const patientId = req.user?.id;
    if (!patientId) return res.status(401).json({ message: 'Unauthorized' });

    const order = await StoreOrder.findOne({
      patientId,
      status: 'completed',
      reviewStatus: 'pending'
    })
      .populate('storeId', 'name avatarDocument')
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({ order: order || null });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch pending review', error: error.message });
  }
};

// ─── Submit a store review from a patient after delivery ───
export const submitStoreOrderReview = async (req, res) => {
  try {
    const patientId = req.user?.id;
    const { orderId } = req.params;
    const normalizedRating = Math.trunc(Number(req.body?.rating));
    const normalizedComment = String(req.body?.comment || '').trim().slice(0, 1000);

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const order = await StoreOrder.findOne({ _id: orderId, patientId, status: 'completed' });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.reviewStatus === 'submitted') {
      return res.status(409).json({ message: 'You already reviewed this order' });
    }
    if (order.reviewStatus === 'skipped') {
      return res.status(409).json({ message: 'You skipped this review and cannot rate it now' });
    }

    const patient = await Patient.findById(patientId).select('firstName lastName').lean();
    const patientName = `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim() || order.patientName;
    const reviewCreatedAt = new Date();

    order.reviewStatus = 'submitted';
    order.reviewRating = normalizedRating;
    order.reviewComment = normalizedComment;
    order.reviewedAt = reviewCreatedAt;
    await order.save();

    // Push review into MedicalStore model and recalculate avg
    const store = await MedicalStore.findById(order.storeId);
    if (store) {
      store.reviews.push({
        patientId,
        patientName,
        rating: normalizedRating,
        comment: normalizedComment,
        createdAt: reviewCreatedAt
      });
      const total = store.reviews.length;
      const sum = store.reviews.reduce((acc, r) => acc + r.rating, 0);
      store.totalReviews = total;
      store.averageRating = total ? parseFloat((sum / total).toFixed(2)) : 0;
      await store.save();
    }

    return res.status(200).json({ message: 'Review submitted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not submit review', error: error.message });
  }
};

// ─── Skip a store review ───
export const skipStoreOrderReview = async (req, res) => {
  try {
    const patientId = req.user?.id;
    const { orderId } = req.params;
    const confirmSkip = Boolean(req.body?.confirmSkip);

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    if (!confirmSkip) {
      return res.status(400).json({ message: 'Please confirm before skipping' });
    }

    const order = await StoreOrder.findOne({ _id: orderId, patientId, status: 'completed' });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.reviewStatus === 'submitted') {
      return res.status(409).json({ message: 'You already reviewed this order' });
    }
    if (order.reviewStatus === 'skipped') {
      return res.status(200).json({ message: 'Already skipped' });
    }

    order.reviewStatus = 'skipped';
    order.reviewSkippedAt = new Date();
    order.reviewSkipConfirmed = true;
    await order.save();

    return res.status(200).json({ message: 'Review skipped' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not skip review', error: error.message });
  }
};
