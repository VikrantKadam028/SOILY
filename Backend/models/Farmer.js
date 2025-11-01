const mongoose = require('mongoose');

const farmerSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [3, 'Name must be at least 3 characters long'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please enter a valid email address'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
    match: [
      /^[6-9]\d{9}$/,
      'Please enter a valid 10-digit phone number'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long']
  },
  location: {
    type: String,
    required: [true, 'Farm location is required'],
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
  },
  farmSize: {
    type: String,
    required: [true, 'Farm size is required'],
    enum: {
      values: ['small', 'medium', 'large', 'xlarge'],
      message: 'Farm size must be small, medium, large, or xlarge'
    }
  },
  preferredLanguage: {
    type: String,
    required: true,
    default: 'en',
    enum: {
      values: ['en', 'hi', 'mr', 'gu', 'pa', 'ta', 'te', 'bn', 'kn', 'ml', 'or', 'as', 'ur'],
      message: 'Invalid language code'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  },
  profileImage: {
    type: String,
    default: null
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: {
      type: String,
      default: 'India'
    }
  },
  crops: [{
    name: String,
    season: String,
    area: Number
  }],
  soilType: {
    type: String,
    enum: ['Alluvial', 'Black', 'Red', 'Laterite', 'Desert', 'Mountain', 'Mixed', 'Other']
  },
  irrigationType: {
    type: String,
    enum: ['Drip', 'Sprinkler', 'Flood', 'Rainfed', 'Mixed', 'Other']
  },
  farmingExperience: {
    type: Number, // years
    min: 0
  },
  notifications: {
    email: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: true
    },
    push: {
      type: Boolean,
      default: true
    }
  },
  subscription: {
    type: {
      type: String,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      default: 'free'
    },
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active'
    }
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  loginHistory: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String
  }],
  notes: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true // automatically adds createdAt and updatedAt
});

// Indexes for better query performance
farmerSchema.index({ email: 1 });
farmerSchema.index({ phone: 1 });
farmerSchema.index({ location: 1 });
farmerSchema.index({ createdAt: -1 });

// Virtual for farm size description
farmerSchema.virtual('farmSizeDescription').get(function() {
  const descriptions = {
    small: 'Less than 2 acres',
    medium: '2-10 acres',
    large: '10-50 acres',
    xlarge: 'More than 50 acres'
  };
  return descriptions[this.farmSize] || 'Unknown';
});

// Virtual for language name
farmerSchema.virtual('languageName').get(function() {
  const languages = {
    en: 'English',
    hi: 'Hindi (हिंदी)',
    mr: 'Marathi (मराठी)',
    gu: 'Gujarati (ગુજરાતી)',
    pa: 'Punjabi (ਪੰਜਾਬੀ)',
    ta: 'Tamil (தமிழ்)',
    te: 'Telugu (తెలుగు)',
    bn: 'Bengali (বাংলা)',
    kn: 'Kannada (ಕನ್ನಡ)',
    ml: 'Malayalam (മലയാളം)',
    or: 'Odia (ଓଡ଼ିଆ)',
    as: 'Assamese (অসমীয়া)',
    ur: 'Urdu (اردو)'
  };
  return languages[this.preferredLanguage] || 'English';
});

// Instance method to check if farmer has premium subscription
farmerSchema.methods.hasPremiumAccess = function() {
  return this.subscription.type === 'premium' || 
         this.subscription.type === 'enterprise';
};

// Instance method to check if subscription is active
farmerSchema.methods.isSubscriptionActive = function() {
  if (this.subscription.type === 'free') return true;
  
  return this.subscription.status === 'active' && 
         this.subscription.endDate && 
         this.subscription.endDate > new Date();
};

// Instance method to get farmer's full profile
farmerSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    fullName: this.fullName,
    email: this.email,
    phone: this.phone,
    location: this.location,
    farmSize: this.farmSize,
    farmSizeDescription: this.farmSizeDescription,
    preferredLanguage: this.preferredLanguage,
    languageName: this.languageName,
    profileImage: this.profileImage,
    isVerified: this.isVerified,
    createdAt: this.createdAt
  };
};

// Static method to get farmer statistics
farmerSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalFarmers: { $sum: 1 },
        activeFarmers: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        verifiedFarmers: {
          $sum: { $cond: ['$isVerified', 1, 0] }
        }
      }
    }
  ]);

  const farmSizeStats = await this.aggregate([
    {
      $group: {
        _id: '$farmSize',
        count: { $sum: 1 }
      }
    }
  ]);

  const languageStats = await this.aggregate([
    {
      $group: {
        _id: '$preferredLanguage',
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    overview: stats[0] || { totalFarmers: 0, activeFarmers: 0, verifiedFarmers: 0 },
    farmSizeDistribution: farmSizeStats,
    languageDistribution: languageStats
  };
};

// Pre-save middleware to handle certain operations
farmerSchema.pre('save', function(next) {
  // Convert email to lowercase
  if (this.email) {
    this.email = this.email.toLowerCase();
  }
  
  // Remove spaces from phone number
  if (this.phone) {
    this.phone = this.phone.replace(/\s/g, '');
  }
  
  next();
});

// Ensure virtuals are included when converting to JSON
farmerSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.password; // Never send password in JSON response
    return ret;
  }
});

farmerSchema.set('toObject', { virtuals: true });

const Farmer = mongoose.model('Farmer', farmerSchema);

module.exports = Farmer;