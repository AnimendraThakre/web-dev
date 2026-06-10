const mongoose = require('mongoose');

/**
 * MongoDB User schema
 * -------------------
 * fullName: String (required)
 * email: String (required, unique, lowercase)
 * password: String (required, bcrypt hash only)
 * otp: String | null (bcrypt hash of 6-digit OTP)
 * otpExpiresAt: Date | null
 */
const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: {
      type: String,
      required: true,
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

// --- In-memory fallback when MongoDB is unavailable ---
const memoryUsers = new Map();
let useMemory = false;

function setMemoryMode(enabled) {
  useMemory = enabled;
  if (enabled) {
    console.warn('[DB] Using in-memory user store (data lost on restart).');
  }
}

function isMemoryMode() {
  return useMemory;
}

async function findByEmail(email) {
  const normalized = email.toLowerCase().trim();
  if (useMemory) {
    return memoryUsers.get(normalized) || null;
  }
  return UserModel.findOne({ email: normalized });
}

async function findById(id) {
  if (useMemory) {
    for (const user of memoryUsers.values()) {
      if (String(user._id) === String(id)) return user;
    }
    return null;
  }
  return UserModel.findById(id);
}

async function createUser(data) {
  if (useMemory) {
    const email = data.email.toLowerCase().trim();
    if (memoryUsers.has(email)) {
      const err = new Error('Email already registered');
      err.code = 11000;
      throw err;
    }
    const user = {
      _id: String(Date.now()) + Math.random().toString(36).slice(2),
      fullName: data.fullName,
      email,
      password: data.password,
      otp: data.otp ?? null,
      otpExpiresAt: data.otpExpiresAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      async save() {
        this.updatedAt = new Date();
        memoryUsers.set(this.email, { ...this, save: this.save });
        return this;
      },
    };
    memoryUsers.set(email, user);
    return user;
  }
  const user = new UserModel(data);
  await user.save();
  return user;
}

async function updateUser(user, updates) {
  Object.assign(user, updates);
  user.updatedAt = new Date();
  if (useMemory) {
    memoryUsers.set(user.email, user);
    return user;
  }
  await user.save();
  return user;
}

async function connectDB(uri) {
  if (!uri) {
    setMemoryMode(true);
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('[DB] Connected to MongoDB');
    setMemoryMode(false);
    return true;
  } catch (err) {
    console.warn('[DB] MongoDB unavailable:', err.message);
    setMemoryMode(true);
    return false;
  }
}

module.exports = {
  UserModel,
  connectDB,
  setMemoryMode,
  isMemoryMode,
  findByEmail,
  findById,
  createUser,
  updateUser,
};
