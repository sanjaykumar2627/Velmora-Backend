import User from '../models/userModel.js';
import Address from '../models/addressModel.js';
import { validateAddress } from '../utils/validators.js';

// ==========================================
// USER PROFILE CONTROLLERS
// ==========================================

/**
 * @desc    Get current user profile
 * @route   GET /api/user/profile
 * @access  Protected
 */
export const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update current user profile
 * @route   PUT /api/user/profile
 * @access  Protected
 */
export const updateUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { fullName, phoneNumber, phone, currentPassword, newPassword } = req.body;

    if (fullName && fullName.trim().length >= 2) {
      user.fullName = fullName.trim();
    }

    if (phoneNumber !== undefined || phone !== undefined) {
      user.phoneNumber = (phoneNumber || phone || '').trim();
    }

    // Optional password update
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to set a new password.',
        });
      }

      const isCurrentValid = await user.comparePassword(currentPassword);
      if (!isCurrentValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password entered is incorrect.',
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters long.',
        });
      }

      user.password = newPassword;
    }

    const updatedUser = await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: updatedUser.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// SAVED ADDRESSES CONTROLLERS
// ==========================================

/**
 * @desc    Get all addresses of authenticated user
 * @route   GET /api/user/addresses
 * @access  Protected
 */
export const getUserAddresses = async (req, res, next) => {
  try {
    const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: addresses.length,
      addresses,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new delivery address
 * @route   POST /api/user/addresses
 * @access  Protected
 */
export const addAddress = async (req, res, next) => {
  try {
    const {
      fullName,
      phoneNumber,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      isDefault,
    } = req.body;

    const effectivePhone = phoneNumber || phone || '';

    const { isValid, errors } = validateAddress({
      fullName,
      phoneNumber: effectivePhone,
      addressLine1,
      city,
      state,
      postalCode,
    });

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join(' '),
        errors,
      });
    }

    // Check existing address count for this user
    const existingCount = await Address.countDocuments({ user: req.user._id });
    
    // First address is automatically default
    const shouldBeDefault = Boolean(isDefault) || existingCount === 0;

    if (shouldBeDefault) {
      await Address.updateMany({ user: req.user._id }, { isDefault: false });
    }

    const newAddress = await Address.create({
      user: req.user._id,
      fullName: fullName.trim(),
      phoneNumber: effectivePhone.trim(),
      addressLine1: addressLine1.trim(),
      addressLine2: (addressLine2 || '').trim(),
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim(),
      country: (country || 'India').trim(),
      isDefault: shouldBeDefault,
    });

    return res.status(201).json({
      success: true,
      message: 'Address saved successfully.',
      address: newAddress,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing address
 * @route   PUT /api/user/addresses/:addressId
 * @access  Protected
 */
export const updateAddress = async (req, res, next) => {
  try {
    const { addressId } = req.params;

    const address = await Address.findOne({ _id: addressId, user: req.user._id });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found or you are not authorized to edit it.',
      });
    }

    const {
      fullName,
      phoneNumber,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      isDefault,
    } = req.body;

    if (fullName) address.fullName = fullName.trim();
    if (phoneNumber || phone) address.phoneNumber = (phoneNumber || phone).trim();
    if (addressLine1) address.addressLine1 = addressLine1.trim();
    if (addressLine2 !== undefined) address.addressLine2 = addressLine2.trim();
    if (city) address.city = city.trim();
    if (state) address.state = state.trim();
    if (postalCode) address.postalCode = postalCode.trim();
    if (country) address.country = country.trim();

    if (isDefault === true && !address.isDefault) {
      await Address.updateMany({ user: req.user._id }, { isDefault: false });
      address.isDefault = true;
    } else if (isDefault === false && address.isDefault) {
      // If unsetting default, keep it if it's the only address
      const total = await Address.countDocuments({ user: req.user._id });
      if (total > 1) {
        address.isDefault = false;
      }
    }

    const updatedAddress = await address.save();

    return res.status(200).json({
      success: true,
      message: 'Address updated successfully.',
      address: updatedAddress,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a saved address
 * @route   DELETE /api/user/addresses/:addressId
 * @access  Protected
 */
export const deleteAddress = async (req, res, next) => {
  try {
    const { addressId } = req.params;

    const address = await Address.findOneAndDelete({ _id: addressId, user: req.user._id });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found or you are not authorized to delete it.',
      });
    }

    // If the deleted address was default, make another address default
    if (address.isDefault) {
      const remainingAddress = await Address.findOne({ user: req.user._id }).sort({ createdAt: -1 });
      if (remainingAddress) {
        remainingAddress.isDefault = true;
        await remainingAddress.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Address deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getUserProfile,
  updateUserProfile,
  getUserAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
};
