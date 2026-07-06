const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    sourceCode: {
      type: String,
      enum: ['01', '02'],
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    sharedUsers: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        email: {
          type: String,
          required: true,
          lowercase: true,
          trim: true
        },
        accessLevel: {
          type: String,
          enum: ['owner', 'editor'],
          default: 'editor'
        },
        addedAt: {
          type: Date,
          default: Date.now
        },
        addedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

accountSchema.index({ owner: 1, name: 1 }, { unique: true });
accountSchema.index({ 'sharedUsers.user': 1 });
accountSchema.index({ 'sharedUsers.email': 1 });

accountSchema.pre('save', function preSave(next) {
  if (!Array.isArray(this.sharedUsers)) {
    this.sharedUsers = [];
  }

  const deduped = [];
  const seen = new Set();
  for (const entry of this.sharedUsers) {
    if (!entry || !entry.user) continue;
    const key = String(entry.user);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  this.sharedUsers = deduped;
  next();
});

accountSchema.methods.hasUserAccess = function hasUserAccess(userId) {
  if (!userId) return false;
  if (String(this.owner) === String(userId)) return true;
  return Array.isArray(this.sharedUsers) && this.sharedUsers.some((entry) => String(entry.user) === String(userId));
};

accountSchema.methods.getAccessLevelForUser = function getAccessLevelForUser(userId) {
  if (!userId) return null;
  if (String(this.owner) === String(userId)) return 'owner';
  const shared = Array.isArray(this.sharedUsers)
    ? this.sharedUsers.find((entry) => String(entry.user) === String(userId))
    : null;
  return shared?.accessLevel || null;
};

module.exports = mongoose.model('Account', accountSchema);
