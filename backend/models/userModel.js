import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address.']
  },
  name: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true,
    // Never loaded unless a query explicitly asks for '+password'.
    select: false
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Non Binary'],
    required: true
  },
  age: {
    type: Number,
    required: true,
    min: 0
  },
  bio: {
    type: String,
    default: ''
  },
  profilePicture: {
    type: String, // This will store the file path
    default: ''
  },
  journals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Journal'
  }],
  // AI Support only (never any chat content). A self-declared adult
  // attestation: it is NOT identity or verified age. Kept separate from consent
  // to external AI processing. Absent until the user confirms; never returned
  // by profile endpoints (toSafeUser is an allowlist).
  assistantAdultAttestation: {
    type: new mongoose.Schema({
      attestedAt: { type: Date, required: true },
      ageAtAttestation: { type: Number, required: true, min: 18, max: 120 }
    }, { _id: false }),
    default: undefined
  },
  // AI Support only: consent to sending messages to the external AI provider.
  // Absent means no consent; removed on withdrawal.
  assistantConsent: {
    type: new mongoose.Schema({
      noticeVersion: { type: String, required: true, maxlength: 64 },
      grantedAt: { type: Date, required: true }
    }, { _id: false }),
    default: undefined
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const User = mongoose.model('User', userSchema);
export default User;
