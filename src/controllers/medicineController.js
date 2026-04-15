import { Medicine } from '../models/Medicine.js';

// Get all medicines for a store
export const getMedicines = async (req, res) => {
  try {
    const storeId = req.user.id;
    const medicines = await Medicine.find({ storeId }).sort({ createdAt: -1 });
    res.json(medicines);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching medicines' });
  }
};

// Add new medicine
export const addMedicine = async (req, res) => {
  try {
    const storeId = req.user.id;
    const { name, brand, price, stock, category, description } = req.body;

    const newMedicine = new Medicine({
      storeId,
      name,
      brand,
      price,
      stock,
      category,
      description,
      status: stock > 0 ? 'In Stock' : 'Out of Stock'
    });

    const savedMedicine = await newMedicine.save();
    res.status(201).json(savedMedicine);
  } catch (error) {
    res.status(500).json({ error: 'Server error adding medicine' });
  }
};

// Update existing medicine
export const updateMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const storeId = req.user.id;
    const updates = req.body;

    // Calculate new status if stock is provided
    if (updates.stock !== undefined) {
      updates.status = updates.stock > 0 ? 'In Stock' : 'Out of Stock';
    }

    const updatedMedicine = await Medicine.findOneAndUpdate(
      { _id: id, storeId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedMedicine) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    res.json(updatedMedicine);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating medicine' });
  }
};

// Delete medicine
export const deleteMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const storeId = req.user.id;

    const deletedMedicine = await Medicine.findOneAndDelete({ _id: id, storeId });

    if (!deletedMedicine) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    res.json({ message: 'Medicine deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error deleting medicine' });
  }
};
