import { StoreOrder } from '../models/StoreOrder.js';
import { Medicine } from '../models/Medicine.js';
import { MedicalStore } from '../models/MedicalStore.js';
import { Patient } from '../models/Patient.js';
import { StoreOrderNotification } from '../models/StoreOrderNotification.js';
import { uploadPrescriptionToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService.js';
import {
  sendStoreOrderPlacedEmail,
  sendStoreNewOrderEmail,
  sendStoreOrderAcceptedEmail,
  sendStoreOrderRejectedEmail
} from '../services/mailService.js';
import { getStripeClient } from '../services/stripeService.js';

// ─── Store: Get all orders for this store ───
export const getStoreOrders = async (req, res) => {
  try {
    const storeId = req.user.id;
    const { status } = req.query;

    const filter = { storeId };
    if (status && status !== 'all') filter.status = status;

    const orders = await StoreOrder.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  } catch (err) {
    console.error('getStoreOrders:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

// ─── Store: Get single order detail ───
export const getStoreOrderById = async (req, res) => {
  try {
    const storeId = req.user.id;
    const order = await StoreOrder.findOne({ _id: req.params.id, storeId }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
};

// ─── Store: Accept order ───
export const acceptOrder = async (req, res) => {
  try {
    const storeId = req.user.id;
    const { storeNote = '' } = req.body;

    const order = await StoreOrder.findOne({ _id: req.params.id, storeId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status === 'accepted' || order.status === 'completed') {
      return res.status(400).json({ error: 'Order is already accepted or completed' });
    }
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot accept a cancelled order' });
    }

    order.status = 'accepted';
    order.storeNote = storeNote;
    await order.save();

    // Fetch store name for notifications/emails
    const store = await MedicalStore.findById(storeId).select('name email').lean();

    // Create in-app notification for the patient
    if (order.patientId) {
      StoreOrderNotification.create({
        patientId: order.patientId,
        orderId: order._id,
        eventType: 'order_accepted',
        title: 'Order Accepted',
        message: `Your order from ${store?.name || 'the store'} has been accepted!${storeNote ? ' Note: ' + storeNote : ''}`,
        meta: { storeName: store?.name, totalAmount: order.totalAmount }
      }).catch(console.error);
    }

    // Send emails (fire and forget)
    const emailPayload = {
      patientName: order.patientName,
      storeName: store?.name || 'Medical Store',
      items: order.items,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      storeNote
    };

    if (order.patientEmail) {
      sendStoreOrderAcceptedEmail({ to: order.patientEmail, ...emailPayload }).catch(console.error);
    }

    return res.json({ message: 'Order accepted', order });
  } catch (err) {
    console.error('acceptOrder:', err);
    res.status(500).json({ error: 'Failed to accept order' });
  }
};

// ─── Store: Decline order ───
export const declineOrder = async (req, res) => {
  try {
    const storeId = req.user.id;
    const { rejectionReason = '', storeNote = '' } = req.body;

    const order = await StoreOrder.findOne({ _id: req.params.id, storeId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }
    if (['accepted', 'completed'].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot decline an already accepted or completed order' });
    }

    // Restore stock for each item
    for (const item of order.items || []) {
      await Medicine.findByIdAndUpdate(item.medicineId, {
        $inc: { stock: item.quantity },
        $set: { status: 'In Stock' }
      });
    }

    // Attempt Stripe refund if paid via stripe
    let refundProcessed = false;
    if (order.paymentMethod === 'stripe' && order.stripePaymentIntentId && order.paymentStatus === 'paid') {
      try {
        const stripe = getStripeClient();
        await stripe.refunds.create({
          payment_intent: order.stripePaymentIntentId,
          reason: 'requested_by_customer'
        });
        refundProcessed = true;
        order.paymentStatus = 'refunded';
      } catch (refundErr) {
        console.error('Stripe refund failed:', refundErr);
      }
    }

    order.status = 'cancelled';
    order.rejectionReason = rejectionReason;
    order.storeNote = storeNote;
    await order.save();

    // Fetch store name for notifications/emails
    const store = await MedicalStore.findById(storeId).select('name email').lean();

    // Create in-app notification for the patient
    if (order.patientId) {
      StoreOrderNotification.create({
        patientId: order.patientId,
        orderId: order._id,
        eventType: 'order_declined',
        title: 'Order Declined',
        message: `Your order from ${store?.name || 'the store'} was declined.${rejectionReason ? ' Reason: ' + rejectionReason : ''}${refundProcessed ? ' A refund has been initiated.' : ''}`,
        meta: { storeName: store?.name, rejectionReason, refundProcessed }
      }).catch(console.error);
    }

    if (order.patientEmail) {
      sendStoreOrderRejectedEmail({
        to: order.patientEmail,
        patientName: order.patientName,
        storeName: store?.name || 'Medical Store',
        items: order.items,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        rejectionReason,
        refundProcessed
      }).catch(console.error);
    }

    return res.json({ message: 'Order declined', order, refundProcessed });
  } catch (err) {
    console.error('declineOrder:', err);
    res.status(500).json({ error: 'Failed to decline order' });
  }
};

// ─── Store: Update order status / internal note ───
export const updateOrderStatus = async (req, res) => {
  try {
    const storeId = req.user.id;
    const { status, storeNote } = req.body;

    const allowed = [
      'pending', 'reviewing', 'accepted', 'ready', 'completed', 'cancelled',
      'Processing', 'Processed', 'Dispatched', 'Delivered'
    ];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const order = await StoreOrder.findOne({ _id: req.params.id, storeId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const updates = {};
    if (storeNote !== undefined) updates.storeNote = storeNote;

    if (status) {
      // When store marks Delivered → auto-complete the order and open the review prompt
      if (status === 'Delivered') {
        updates.status = 'completed';
        updates.reviewStatus = 'pending';
        
        // Only increment earnings if the order wasn't already completed
        if (order.status !== 'completed' && order.status !== 'Delivered') {
          await MedicalStore.findByIdAndUpdate(storeId, {
            $inc: { totalEarningsInRupees: order.totalAmount || 0 }
          });
        }
      } else {
        updates.status = status;
      }
    }

    const updated = await StoreOrder.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Order not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order' });
  }
};

// ─── Store: Delete an order ───
export const deleteStoreOrder = async (req, res) => {
  try {
    const storeId = req.user.id;
    const order = await StoreOrder.findOneAndDelete({ _id: req.params.id, storeId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Clean up prescription files from Cloudinary
    for (const p of order.prescriptions || []) {
      await deleteFromCloudinary(p.publicId, p.resourceType || 'image').catch(() => {});
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
};

// ─── Patient: Submit an order with prescriptions ───
// Note: No auth required — any patient (registered or not) can submit
export const submitPatientOrder = async (req, res) => {
  try {
    const { storeId, patientName, patientPhone, patientEmail, notes } = req.body;

    if (!storeId || !patientName) {
      return res.status(400).json({ error: 'storeId and patientName are required' });
    }

    const prescriptions = [];

    // Upload any attached files to Cloudinary
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploaded = await uploadPrescriptionToCloudinary(file);
        prescriptions.push(uploaded);
      }
    }

    const order = new StoreOrder({
      storeId,
      patientName: patientName.trim(),
      patientPhone: patientPhone?.trim() || '',
      patientEmail: patientEmail?.trim() || '',
      notes: notes?.trim() || '',
      prescriptions
    });

    const saved = await order.save();

    // Email notifications (fire and forget)
    const store = await MedicalStore.findById(storeId).select('name email').lean();
    if (store?.email) {
      sendStoreNewOrderEmail({
        to: store.email,
        storeName: store.name,
        patientName: patientName.trim(),
        items: [],
        totalAmount: 0,
        orderId: String(saved._id)
      }).catch(console.error);
    }

    res.status(201).json(saved);
  } catch (err) {
    console.error('submitPatientOrder:', err);
    res.status(500).json({ error: 'Failed to submit order' });
  }
};
