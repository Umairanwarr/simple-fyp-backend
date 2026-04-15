import { StoreOrder } from '../models/StoreOrder.js';
import { uploadPrescriptionToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService.js';

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

// ─── Store: Update order status / internal note ───
export const updateOrderStatus = async (req, res) => {
  try {
    const storeId = req.user.id;
    const { status, storeNote } = req.body;

    const allowed = ['pending', 'reviewing', 'ready', 'completed', 'cancelled'];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const updates = {};
    if (status) updates.status = status;
    if (storeNote !== undefined) updates.storeNote = storeNote;

    const updated = await StoreOrder.findOneAndUpdate(
      { _id: req.params.id, storeId },
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
    res.status(201).json(saved);
  } catch (err) {
    console.error('submitPatientOrder:', err);
    res.status(500).json({ error: 'Failed to submit order' });
  }
};
