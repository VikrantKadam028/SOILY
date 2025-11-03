const mongoose = require("mongoose");

const soilAnalysisSchema = new mongoose.Schema(
  {
    farmerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Farmer",
      required: [true, "Farmer ID is required"],
      index: true,
    },

    // Farm Boundary Information
    boundary: {
      coordinates: {
        type: [[Number]], // Array of [longitude, latitude] pairs
        required: true,
      },
      area: {
        type: Number, // in acres
        required: true,
      },
      perimeter: {
        type: Number, // in kilometers
        required: true,
      },
      centerPoint: {
        latitude: {
          type: Number,
          required: true,
        },
        longitude: {
          type: Number,
          required: true,
        },
      },
    },

    // Soil Properties
    soilProperties: {
      pH: {
        type: Number,
        required: true,
        min: 0,
        max: 14,
      },
      nitrogen: {
        type: Number, // kg/ha
        required: true,
      },
      phosphorus: {
        type: Number, // kg/ha
        required: true,
      },
      potassium: {
        type: Number, // kg/ha
        required: true,
      },
      organicCarbon: {
        type: Number, // g/kg
        required: true,
      },
      clay: {
        type: Number, // percentage
        required: true,
      },
      sand: {
        type: Number, // percentage
        default: null,
      },
      bulkDensity: {
        type: Number, // g/cm³
        default: null,
      },
      cec: {
        type: Number, // cmol/kg
        default: null,
      },
      soilType: {
        type: String,
        enum: [
          "Clay",
          "Sandy",
          "Silty",
          "Clay Loam",
          "Sandy Loam",
          "Silty Loam",
          "Loam",
          "Other",
        ],
        required: true,
      },
    },

    // Climate Data
    climateData: {
      rainfall: {
        type: Number, // mm
        required: true,
      },
      temperature: {
        type: Number, // °C
        required: true,
      },
    },

    // Soil Color Analysis
    soilColor: {
      rgb: {
        type: String,
        required: true,
      },
      description: {
        type: String,
        required: true,
      },
    },

    // Crop Recommendations
    cropRecommendation: {
      primaryCrop: {
        name: {
          type: String,
          required: true,
        },
        matchScore: {
          type: Number, // percentage
          required: true,
          min: 0,
          max: 100,
        },
        fertilizer: {
          type: String,
          required: true,
        },
      },
      alternativeCrops: [
        {
          name: {
            type: String,
            required: true,
          },
          matchScore: {
            type: Number,
            min: 0,
            max: 100,
          },
        },
      ],
    },

    // Analysis Metadata
    analysisDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    season: {
      type: String,
      enum: ["Kharif", "Rabi", "Zaid", "Year-round"],
      default: function () {
        const month = new Date().getMonth() + 1;
        if (month >= 6 && month <= 10) return "Kharif";
        if (month >= 11 || month <= 3) return "Rabi";
        return "Zaid";
      },
    },
    dataSource: {
      type: String,
      enum: [
        "SoilGrids API",
        "Simulated",
        "Manual Entry",
        "Satellite Analysis",
      ],
      default: "SoilGrids API",
    },

    // Analysis Notes
    notes: {
      type: String,
      maxlength: 1000,
    },

    // Quality Indicators
    soilHealth: {
      type: String,
      enum: ["Excellent", "Good", "Fair", "Poor", "Critical"],
      default: function () {
        const ph = this.soilProperties.pH;
        const oc = this.soilProperties.organicCarbon;

        if (ph >= 6.0 && ph <= 7.5 && oc >= 20) return "Excellent";
        if (ph >= 5.5 && ph <= 8.0 && oc >= 15) return "Good";
        if (ph >= 5.0 && ph <= 8.5 && oc >= 10) return "Fair";
        if (ph >= 4.5 && ph <= 9.0 && oc >= 5) return "Poor";
        return "Critical";
      },
    },

    fertilityRating: {
      type: Number, // 0-10 scale
      default: function () {
        const n = this.soilProperties.nitrogen;
        const p = this.soilProperties.phosphorus;
        const k = this.soilProperties.potassium;

        let rating = 5;
        if (n > 0.5) rating += 1.5;
        if (p > 40) rating += 1.5;
        if (k > 150) rating += 2;

        return Math.min(10, Math.max(0, rating));
      },
    },

    // Report Status
    isArchived: {
      type: Boolean,
      default: false,
    },
    reportViewed: {
      type: Boolean,
      default: false,
    },
    reportDownloaded: {
      type: Boolean,
      default: false,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Indexes for better query performance
soilAnalysisSchema.index({ farmerId: 1, analysisDate: -1 });
soilAnalysisSchema.index({
  "boundary.centerPoint.latitude": 1,
  "boundary.centerPoint.longitude": 1,
});
soilAnalysisSchema.index({ "cropRecommendation.primaryCrop.name": 1 });
soilAnalysisSchema.index({ season: 1 });

// Virtual for formatted analysis date
soilAnalysisSchema.virtual("formattedDate").get(function () {
  return this.analysisDate.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});

// Virtual for NPK summary
soilAnalysisSchema.virtual("npkSummary").get(function () {
  return `N: ${this.soilProperties.nitrogen}, P: ${this.soilProperties.phosphorus}, K: ${this.soilProperties.potassium}`;
});

// Instance method to get summary
soilAnalysisSchema.methods.getSummary = function () {
  return {
    id: this._id,
    date: this.formattedDate,
    area: this.boundary.area,
    soilType: this.soilProperties.soilType,
    pH: this.soilProperties.pH,
    recommendedCrop: this.cropRecommendation.primaryCrop.name,
    matchScore: this.cropRecommendation.primaryCrop.matchScore,
    soilHealth: this.soilHealth,
    fertilityRating: this.fertilityRating,
  };
};

// Instance method to mark as viewed
soilAnalysisSchema.methods.markAsViewed = function () {
  this.reportViewed = true;
  return this.save();
};

// Instance method to increment download count
soilAnalysisSchema.methods.incrementDownloadCount = function () {
  this.reportDownloaded = true;
  this.downloadCount += 1;
  return this.save();
};

// Static method to get farmer's analysis history
soilAnalysisSchema.statics.getFarmerHistory = async function (
  farmerId,
  limit = 10
) {
  return this.find({ farmerId, isArchived: false })
    .sort({ analysisDate: -1 })
    .limit(limit)
    .select("-__v");
};

// Static method to get farmer's statistics
soilAnalysisSchema.statics.getFarmerStats = async function (farmerId) {
  const analyses = await this.find({ farmerId, isArchived: false });

  if (analyses.length === 0) {
    return null;
  }

  const totalArea = analyses.reduce((sum, a) => sum + a.boundary.area, 0);
  const avgpH =
    analyses.reduce((sum, a) => sum + a.soilProperties.pH, 0) / analyses.length;
  const avgFertility =
    analyses.reduce((sum, a) => sum + a.fertilityRating, 0) / analyses.length;

  const cropFrequency = {};
  analyses.forEach((a) => {
    const crop = a.cropRecommendation.primaryCrop.name;
    cropFrequency[crop] = (cropFrequency[crop] || 0) + 1;
  });

  const mostRecommendedCrop = Object.keys(cropFrequency).reduce((a, b) =>
    cropFrequency[a] > cropFrequency[b] ? a : b
  );

  return {
    totalAnalyses: analyses.length,
    totalAreaAnalyzed: totalArea.toFixed(2),
    averagepH: avgpH.toFixed(2),
    averageFertility: avgFertility.toFixed(1),
    mostRecommendedCrop,
    latestAnalysis: analyses[0].analysisDate,
    cropDistribution: cropFrequency,
  };
};

// Static method to get seasonal trends
soilAnalysisSchema.statics.getSeasonalTrends = async function (farmerId) {
  return this.aggregate([
    {
      $match: {
        farmerId: mongoose.Types.ObjectId(farmerId),
        isArchived: false,
      },
    },
    {
      $group: {
        _id: "$season",
        count: { $sum: 1 },
        avgpH: { $avg: "$soilProperties.pH" },
        avgFertility: { $avg: "$fertilityRating" },
        crops: { $push: "$cropRecommendation.primaryCrop.name" },
      },
    },
  ]);
};

// Pre-save middleware
soilAnalysisSchema.pre("save", function (next) {
  // Calculate fertility rating if not set
  if (this.isNew && !this.fertilityRating) {
    const n = this.soilProperties.nitrogen || 0;
    const p = this.soilProperties.phosphorus || 0;
    const k = this.soilProperties.potassium || 0;

    let rating = 5;
    if (n > 0.5) rating += 1.5;
    if (p > 40) rating += 1.5;
    if (k > 150) rating += 2;

    this.fertilityRating = Math.min(10, Math.max(0, rating));
  }

  next();
});

// Ensure virtuals are included when converting to JSON
soilAnalysisSchema.set("toJSON", { virtuals: true });
soilAnalysisSchema.set("toObject", { virtuals: true });

const SoilAnalysis = mongoose.model("SoilAnalysis", soilAnalysisSchema);

module.exports = SoilAnalysis;
