const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);
// Import Models
const Farmer = require("./models/Farmer");
const SoilAnalysis = require("./models/SoilAnalysis");

// Import Utilities
const pdfGenerator = require("./utils/pdfGenerator");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// View Engine Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../Frontend/views"));
app.use(express.static(path.join(__dirname, "../Frontend/public")));

// Session Configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "soily-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl:
        process.env.MONGO_URI ||
        "mongodb+srv://vikrantkk2889:clZRES2qrls0b4n9@cluster0.yqonlou.mongodb.net/soilyFinal",
      touchAfter: 24 * 3600,
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // ADD THIS
    },
  })
);

// MongoDB Connection
mongoose
  .connect(
    process.env.MONGO_URI ||
      "mongodb+srv://vikrantkk2889:clZRES2qrls0b4n9@cluster0.yqonlou.mongodb.net/soilyFinal",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("✅ MongoDB connected to soilyFinal database"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Middleware Functions
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.farmerId) {
    return next();
  }
  res.redirect("/auth/login");
};

const setLanguage = (req, res, next) => {
  res.locals.language = req.session.language || "en";
  next();
};

app.use(setLanguage);

// Google Earth Engine Configuration
const eeProject = "projects/demoauth-fcf39";

// ============================================
// BASIC ROUTES
// ============================================

app.get("/", (req, res) => {
  if (req.session.farmerId) {
    res.redirect("/dashboard");
  } else {
    res.redirect("/auth/login");
  }
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Login Page
app.get("/auth/login", (req, res) => {
  if (req.session.farmerId) {
    return res.redirect("/dashboard");
  }
  res.render("auth/login", { error: null });
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password, remember } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const farmer = await Farmer.findOne({ email: email.toLowerCase() });

    if (!farmer) {
      return res.status(401).json({
        success: false,
        field: "email",
        message: "Invalid email or password",
      });
    }

    if (!farmer.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, farmer.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        field: "password",
        message: "Invalid email or password",
      });
    }

    farmer.lastLogin = new Date();
    await farmer.save();

    // Set session data
    req.session.farmerId = farmer._id;
    req.session.farmerName = farmer.fullName;
    req.session.language = farmer.preferredLanguage;

    if (remember) {
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
    }

    // IMPORTANT: Save session before sending response
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({
          success: false,
          message: "Session error occurred",
        });
      }

      res.json({
        success: true,
        message: "Login successful",
        redirectUrl: "/dashboard",
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during login",
    });
  }
});

// Register Page
app.get("/auth/register", (req, res) => {
  if (req.session.farmerId) {
    return res.redirect("/dashboard");
  }
  res.render("auth/register", { error: null });
});

// Register Handler
app.post("/auth/register", async (req, res) => {
  try {
    const { fullName, email, phone, location, farmSize, password, language } =
      req.body;

    if (!fullName || !email || !phone || !location || !farmSize || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        field: "email",
        message: "Invalid email format",
      });
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ""))) {
      return res.status(400).json({
        success: false,
        field: "phone",
        message: "Invalid phone number format",
      });
    }

    const existingEmail = await Farmer.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        field: "email",
        message: "Email already registered",
      });
    }

    const existingPhone = await Farmer.findOne({
      phone: phone.replace(/\s/g, ""),
    });
    if (existingPhone) {
      return res.status(409).json({
        success: false,
        field: "phone",
        message: "Phone number already registered",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        field: "password",
        message: "Password must be at least 8 characters long",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newFarmer = new Farmer({
      fullName,
      email: email.toLowerCase(),
      phone: phone.replace(/\s/g, ""),
      location,
      farmSize,
      password: hashedPassword,
      preferredLanguage: language || "en",
    });

    await newFarmer.save();

    res.status(201).json({
      success: true,
      message: "Registration successful",
      farmerId: newFarmer._id,
    });
  } catch (error) {
    console.error("Registration error:", error);

    if (error.name === "ValidationError") {
      const field = Object.keys(error.errors)[0];
      return res.status(400).json({
        success: false,
        field,
        message: error.errors[field].message,
      });
    }

    res.status(500).json({
      success: false,
      message: "An error occurred during registration",
    });
  }
});

// Logout
app.get("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/auth/login");
  });
});

// ============================================
// DASHBOARD & PROFILE ROUTES
// ============================================

// Dashboard
app.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.session.farmerId).select(
      "-password"
    );
    res.render("templates/dashboard", {
      farmer,
      language: req.session.language,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.redirect("/auth/login");
  }
});

// Profile Page
app.get("/profile", isAuthenticated, async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.session.farmerId).select(
      "-password"
    );
    res.render("templates/profile", {
      farmer,
      language: req.session.language,
    });
  } catch (error) {
    console.error("Profile page error:", error);
    res.redirect("/dashboard");
  }
});

// ============================================
// FARMER API ROUTES
// ============================================

// Update Language
app.post("/api/language", isAuthenticated, async (req, res) => {
  try {
    const { language } = req.body;

    await Farmer.findByIdAndUpdate(req.session.farmerId, {
      preferredLanguage: language,
    });

    req.session.language = language;

    res.json({
      success: true,
      message: "Language preference updated",
    });
  } catch (error) {
    console.error("Language update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update language preference",
    });
  }
});

// Get Farmer Profile
app.get("/api/farmer/profile", isAuthenticated, async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.session.farmerId).select(
      "-password"
    );
    res.json({ success: true, farmer });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
});

// Update Farmer Profile
app.put("/api/farmer/profile", isAuthenticated, async (req, res) => {
  try {
    const { fullName, phone, location, farmSize } = req.body;

    const updatedFarmer = await Farmer.findByIdAndUpdate(
      req.session.farmerId,
      { fullName, phone, location, farmSize },
      { new: true, runValidators: true }
    ).select("-password");

    req.session.farmerName = updatedFarmer.fullName;

    res.json({
      success: true,
      message: "Profile updated successfully",
      farmer: updatedFarmer,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
});

// Update Farm Details
app.put("/api/farmer/farm-details", isAuthenticated, async (req, res) => {
  try {
    const { location, farmSize, notes } = req.body;

    const updatedFarmer = await Farmer.findByIdAndUpdate(
      req.session.farmerId,
      { location, farmSize, notes },
      { new: true, runValidators: true }
    ).select("-password");

    res.json({
      success: true,
      message: "Farm details updated successfully",
      farmer: updatedFarmer,
    });
  } catch (error) {
    console.error("Farm details update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update farm details",
    });
  }
});

// Change Password
app.post("/api/farmer/change-password", isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const farmer = await Farmer.findById(req.session.farmerId);

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      farmer.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    farmer.password = hashedPassword;
    await farmer.save();

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update password",
    });
  }
});

// Delete Account
app.delete("/api/farmer/delete-account", isAuthenticated, async (req, res) => {
  try {
    await Farmer.findByIdAndDelete(req.session.farmerId);

    req.session.destroy((err) => {
      if (err) console.error("Session destroy error:", err);
    });

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Account deletion error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete account",
    });
  }
});

// ============================================
// SOIL MAPPING ROUTES
// ============================================

// Soil Map Page
app.get("/soil-map", isAuthenticated, async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.session.farmerId);

    if (!farmer) {
      return res.redirect("/auth/login");
    }

    res.render("templates/soil-map", { farmer });
  } catch (error) {
    console.error("Soil map page error:", error);
    res.redirect("/dashboard");
  }
});

// Analyze Field with Google Earth Engine
app.post("/api/analyze-field", isAuthenticated, async (req, res) => {
  try {
    const { coordinates } = req.body;

    if (!coordinates) {
      return res
        .status(400)
        .json({ success: false, message: "No coordinates provided" });
    }

    const auth = new GoogleAuth({
      keyFile: path.join(__dirname, "./gee-service-key.json"),
      scopes: ["https://www.googleapis.com/auth/earthengine.readonly"],
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();

    const polygon = {
      type: "Polygon",
      coordinates: [coordinates],
    };

    const requestBody = {
      expression: `
        var region = ee.Geometry(${JSON.stringify(polygon)});
        var img = ee.ImageCollection('COPERNICUS/S2')
            .filterBounds(region)
            .filterDate('2024-01-01', '2024-12-31')
            .sort('CLOUDY_PIXEL_PERCENTAGE')
            .first()
            .select(['B4','B3','B2']);
        img.visualize({min:0, max:2000});
      `,
      fileFormat: "png",
      region: polygon,
    };

    const response = await axios.post(
      `https://earthengine.googleapis.com/v1/${eeProject}:getPixels`,
      requestBody,
      {
        responseType: "arraybuffer",
        headers: { Authorization: `Bearer ${token.token}` },
      }
    );

    const base64Image = Buffer.from(response.data, "binary").toString("base64");
    const imageUrl = `data:image/png;base64,${base64Image}`;

    res.json({
      success: true,
      imageUrl,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({ success: false, message: "Satellite fetch failed" });
  }
});

// ============================================
// SOIL ANALYSIS API ROUTES
// ============================================

// Save Soil Analysis
app.post("/api/soil-analysis/save", isAuthenticated, async (req, res) => {
  try {
    const {
      boundary,
      soilProperties,
      climateData,
      soilColor,
      cropRecommendation,
      notes,
      dataSource,
    } = req.body;

    if (!boundary || !soilProperties || !climateData || !cropRecommendation) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const newAnalysis = new SoilAnalysis({
      farmerId: req.session.farmerId,
      boundary,
      soilProperties,
      climateData,
      soilColor,
      cropRecommendation,
      notes,
      dataSource: dataSource || "SoilGrids API",
    });

    await newAnalysis.save();

    res.json({
      success: true,
      message: "Soil analysis saved successfully",
      analysisId: newAnalysis._id,
    });
  } catch (error) {
    console.error("Save analysis error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save soil analysis",
      error: error.message,
    });
  }
});

// Get All Reports for Farmer
app.get("/api/soil-analysis/reports", isAuthenticated, async (req, res) => {
  try {
    const reports = await SoilAnalysis.find({
      farmerId: req.session.farmerId,
      isArchived: false,
    })
      .sort({ analysisDate: -1 })
      .select("-__v");

    const stats = await SoilAnalysis.getFarmerStats(req.session.farmerId);

    res.json({
      success: true,
      reports,
      stats,
    });
  } catch (error) {
    console.error("Fetch reports error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// Get Single Report by ID
app.get("/api/soil-analysis/report/:id", isAuthenticated, async (req, res) => {
  try {
    const analysis = await SoilAnalysis.findOne({
      _id: req.params.id,
      farmerId: req.session.farmerId,
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    await analysis.markAsViewed();

    res.json({
      success: true,
      report: analysis,
    });
  } catch (error) {
    console.error("Fetch report error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report",
      error: error.message,
    });
  }
});

// Delete a Report
app.delete(
  "/api/soil-analysis/report/:id",
  isAuthenticated,
  async (req, res) => {
    try {
      const analysis = await SoilAnalysis.findOneAndDelete({
        _id: req.params.id,
        farmerId: req.session.farmerId,
      });

      if (!analysis) {
        return res.status(404).json({
          success: false,
          message: "Report not found",
        });
      }

      res.json({
        success: true,
        message: "Report deleted successfully",
      });
    } catch (error) {
      console.error("Delete report error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete report",
        error: error.message,
      });
    }
  }
);

// Download Single Report as PDF
app.get(
  "/api/soil-analysis/download/:id",
  isAuthenticated,
  async (req, res) => {
    try {
      const analysis = await SoilAnalysis.findOne({
        _id: req.params.id,
        farmerId: req.session.farmerId,
      });

      if (!analysis) {
        return res.status(404).json({
          success: false,
          message: "Report not found",
        });
      }

      const farmer = await Farmer.findById(req.session.farmerId).select(
        "-password"
      );

      const pdfBuffer = await pdfGenerator.generateSingleReport(
        analysis,
        farmer
      );

      await analysis.incrementDownloadCount();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=soil-analysis-${analysis._id}.pdf`
      );
      res.setHeader("Content-Length", pdfBuffer.length);

      res.send(pdfBuffer);
    } catch (error) {
      console.error("Download PDF error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to generate PDF",
        error: error.message,
      });
    }
  }
);

// Export All Reports as Single PDF
app.get("/api/soil-analysis/export-all", isAuthenticated, async (req, res) => {
  try {
    const analyses = await SoilAnalysis.find({
      farmerId: req.session.farmerId,
      isArchived: false,
    }).sort({ analysisDate: -1 });

    if (analyses.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No reports found to export",
      });
    }

    const farmer = await Farmer.findById(req.session.farmerId).select(
      "-password"
    );

    const pdfBuffer = await pdfGenerator.generateMultipleReports(
      analyses,
      farmer
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=all-soil-reports-${Date.now()}.pdf`
    );
    res.setHeader("Content-Length", pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error("Export all PDF error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export reports",
      error: error.message,
    });
  }
});

// Get Farmer's Analysis Statistics
app.get("/api/soil-analysis/statistics", isAuthenticated, async (req, res) => {
  try {
    const stats = await SoilAnalysis.getFarmerStats(req.session.farmerId);

    if (!stats) {
      return res.json({
        success: true,
        stats: {
          totalAnalyses: 0,
          totalAreaAnalyzed: "0.00",
          averagepH: "-",
          averageFertility: "-",
          mostRecommendedCrop: "-",
          latestAnalysis: null,
          cropDistribution: {},
        },
      });
    }

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
});

// Get Seasonal Trends
app.get(
  "/api/soil-analysis/seasonal-trends",
  isAuthenticated,
  async (req, res) => {
    try {
      const trends = await SoilAnalysis.getSeasonalTrends(req.session.farmerId);

      res.json({
        success: true,
        trends,
      });
    } catch (error) {
      console.error("Seasonal trends error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch seasonal trends",
        error: error.message,
      });
    }
  }
);

// Update Analysis Notes
app.put(
  "/api/soil-analysis/report/:id/notes",
  isAuthenticated,
  async (req, res) => {
    try {
      const { notes } = req.body;

      const analysis = await SoilAnalysis.findOneAndUpdate(
        {
          _id: req.params.id,
          farmerId: req.session.farmerId,
        },
        { notes },
        { new: true }
      );

      if (!analysis) {
        return res.status(404).json({
          success: false,
          message: "Report not found",
        });
      }

      res.json({
        success: true,
        message: "Notes updated successfully",
        report: analysis,
      });
    } catch (error) {
      console.error("Update notes error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update notes",
        error: error.message,
      });
    }
  }
);

app.put(
  "/api/soil-analysis/report/:id/archive",
  isAuthenticated,
  async (req, res) => {
    try {
      const analysis = await SoilAnalysis.findOneAndUpdate(
        {
          _id: req.params.id,
          farmerId: req.session.farmerId,
        },
        { isArchived: true },
        { new: true }
      );

      if (!analysis) {
        return res.status(404).json({
          success: false,
          message: "Report not found",
        });
      }

      res.json({
        success: true,
        message: "Report archived successfully",
      });
    } catch (error) {
      console.error("Archive report error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to archive report",
        error: error.message,
      });
    }
  }
);

app.get("/reports", isAuthenticated, async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.session.farmerId).select(
      "-password"
    );

    if (!farmer) {
      return res.redirect("/auth/login");
    }

    res.render("templates/reports", {
      farmer,
      language: req.session.language || "en",
    });
  } catch (error) {
    console.error("Reports page error:", error);
    res.redirect("/dashboard");
  }
});

app.get("/api/dashboard/stats", isAuthenticated, async (req, res) => {
  try {
    const farmerId = req.session.farmerId;

    // Get farmer data
    const farmer = await Farmer.findById(farmerId).select("-password");

    // Get soil analysis statistics
    const soilAnalyses = await SoilAnalysis.find({
      farmerId,
      isArchived: false,
    }).sort({ analysisDate: -1 });

    const stats = await SoilAnalysis.getFarmerStats(farmerId);

    // Calculate soil health score (average fertility rating)
    let soilHealthScore = "-";
    if (soilAnalyses.length > 0) {
      const avgFertility =
        soilAnalyses.reduce((sum, a) => sum + a.fertilityRating, 0) /
        soilAnalyses.length;
      soilHealthScore = Math.round((avgFertility / 10) * 100); // Convert to percentage
    }

    // Get farm area from farmer's farm size
    const farmSizeMap = {
      small: "2",
      medium: "6",
      large: "30",
      xlarge: "100",
    };
    const farmArea =
      stats?.totalAreaAnalyzed || farmSizeMap[farmer.farmSize] || "0";

    res.json({
      success: true,
      stats: {
        farmArea: parseFloat(farmArea),
        soilHealth: soilHealthScore,
        activeMaps: soilAnalyses.length,
        recommendations:
          soilAnalyses.length > 0
            ? soilAnalyses[0].cropRecommendation.alternativeCrops.length + 1
            : 0,
        totalAnalyses: stats?.totalAnalyses || 0,
        mostRecommendedCrop: stats?.mostRecommendedCrop || "-",
        averagepH: stats?.averagepH || "-",
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard stats",
    });
  }
});

// Get Recent Activity
app.get("/api/dashboard/recent-activity", isAuthenticated, async (req, res) => {
  try {
    const farmerId = req.session.farmerId;

    // Get recent soil analyses
    const recentAnalyses = await SoilAnalysis.find({
      farmerId,
      isArchived: false,
    })
      .sort({ analysisDate: -1 })
      .limit(5)
      .select("analysisDate boundary soilProperties cropRecommendation");

    const activities = recentAnalyses.map((analysis) => {
      const timeDiff = Date.now() - new Date(analysis.analysisDate).getTime();
      const daysAgo = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      let timeText = "";
      if (daysAgo === 0) {
        const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
        timeText =
          hoursAgo === 0
            ? "Just now"
            : `${hoursAgo} hour${hoursAgo > 1 ? "s" : ""} ago`;
      } else if (daysAgo === 1) {
        timeText = "Yesterday";
      } else {
        timeText = `${daysAgo} days ago`;
      }

      return {
        icon: '<i class="fa-solid fa-circle-check" style="color: #ffffff;"></i>',
        title: "Soil Analysis Completed",
        desc: `${analysis.boundary.area.toFixed(2)} acres - ${
          analysis.soilProperties.soilType
        } soil`,
        time: timeText,
        link: `/reports`,
      };
    });

    // Add farmer registration as first activity if no analyses
    if (activities.length === 0) {
      const farmer = await Farmer.findById(farmerId).select("createdAt");
      const timeDiff = Date.now() - new Date(farmer.createdAt).getTime();
      const daysAgo = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      activities.push({
        icon: "🌱",
        title: "Welcome to SOILY!",
        desc: "Start by creating your first soil analysis",
        time: `${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago`,
        link: "/soil-map",
      });
    }

    res.json({
      success: true,
      activities,
    });
  } catch (error) {
    console.error("Recent activity error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent activity",
    });
  }
});

// Get Personalized Recommendations
app.get("/api/dashboard/recommendations", isAuthenticated, async (req, res) => {
  try {
    const farmerId = req.session.farmerId;

    // Get latest soil analysis
    const latestAnalysis = await SoilAnalysis.findOne({
      farmerId,
      isArchived: false,
    }).sort({ analysisDate: -1 });

    const recommendations = [];

    if (latestAnalysis) {
      const soil = latestAnalysis.soilProperties;
      const crop = latestAnalysis.cropRecommendation.primaryCrop;

      // pH recommendation
      if (soil.pH < 5.5) {
        recommendations.push({
          title: "⚠️ Soil pH Too Acidic",
          desc: `Current pH is ${soil.pH}. Apply lime (calcium carbonate) at 2-3 tons per acre to raise pH to optimal range (6.0-7.0).`,
        });
      } else if (soil.pH > 8.0) {
        recommendations.push({
          title: "⚠️ Soil pH Too Alkaline",
          desc: `Current pH is ${soil.pH}. Apply sulfur or gypsum to lower pH. Add organic matter to improve soil structure.`,
        });
      } else {
        recommendations.push({
          title: "✅ Optimal pH Level",
          desc: `Your soil pH (${soil.pH}) is in the ideal range. Continue current soil management practices.`,
        });
      }

      // NPK recommendation
      const nStatus =
        soil.nitrogen < 0.3 ? "low" : soil.nitrogen > 0.7 ? "high" : "optimal";
      const pStatus =
        soil.phosphorus < 30
          ? "low"
          : soil.phosphorus > 50
          ? "high"
          : "optimal";
      const kStatus =
        soil.potassium < 120
          ? "low"
          : soil.potassium > 200
          ? "high"
          : "optimal";

      if (nStatus === "low" || pStatus === "low" || kStatus === "low") {
        let deficient = [];
        if (nStatus === "low") deficient.push("Nitrogen");
        if (pStatus === "low") deficient.push("Phosphorus");
        if (kStatus === "low") deficient.push("Potassium");

        recommendations.push({
          title: "💊 Fertilizer Application Needed",
          desc: `${deficient.join(", ")} levels are low. Apply ${
            crop.fertilizer
          } at recommended rates before sowing.`,
        });
      } else {
        recommendations.push({
          title: "✅ Balanced Nutrient Levels",
          desc: `NPK levels are well-balanced. Maintain with regular application of ${crop.fertilizer}.`,
        });
      }

      // Crop recommendation
      recommendations.push({
        title: `🌾 Best Crop: ${crop.name}`,
        desc: `Based on your soil conditions (pH: ${soil.pH}, ${
          soil.soilType
        }), ${crop.name} has ${crop.matchScore.toFixed(
          0
        )}% compatibility. Expected yield: High with proper care.`,
      });

      // Organic matter recommendation
      if (soil.organicCarbon < 15) {
        recommendations.push({
          title: "🌱 Improve Organic Matter",
          desc: `Current organic carbon is ${soil.organicCarbon} g/kg. Add compost, green manure, or crop residues to improve soil health and water retention.`,
        });
      }
    } else {
      // No analysis yet - provide general recommendations
      recommendations.push(
        {
          title: "Create Your First Soil Map",
          desc: "Start by mapping your farm boundaries and analyzing your soil to get personalized recommendations.",
        },
        {
          title: "Upload Lab Results",
          desc: "If you have soil test results from a laboratory, upload them for more accurate crop recommendations.",
        },
        {
          title: "Explore Crop Database",
          desc: "Browse through our extensive crop database to learn about different crops suitable for your region.",
        }
      );
    }

    res.json({
      success: true,
      recommendations: recommendations.slice(0, 4),
    });
  } catch (error) {
    console.error("Recommendations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recommendations",
    });
  }
});

// ============================================
// ADMIN ROUTES - Add these to your server.js
// ============================================

// Admin authentication middleware
const isAdmin = (req, res, next) => {
  // Add your admin authentication logic here
  // For now, checking if user is authenticated and has admin role
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.status(403).json({ success: false, message: "Unauthorized access" });
};

// Admin Login Page
app.get("/admin/login", (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect("/admin/dashboard");
  }
  res.render("auth/admin-login", { error: null });
});

// Admin Login Handler
app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (username === "admin" && password === "soilyofficial") {
      req.session.isAdmin = true;
      req.session.adminName = "Administrator";

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({
            success: false,
            message: "Session error occurred",
          });
        }

        res.json({
          success: true,
          message: "Login successful",
          redirectUrl: "/admin/dashboard",
        });
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during login",
    });
  }
});

// Admin Dashboard Page
app.get("/admin/dashboard", isAdmin, (req, res) => {
  res.render("templates/soilyadmin", {
    adminName: req.session.adminName || "Administrator",
  });
});

// Get all farmers with analysis count
app.get("/api/admin/farmers", isAdmin, async (req, res) => {
  try {
    const farmers = await Farmer.find()
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    // Get analysis count for each farmer
    const farmersWithCount = await Promise.all(
      farmers.map(async (farmer) => {
        const analysisCount = await SoilAnalysis.countDocuments({
          farmerId: farmer._id,
        });
        return {
          ...farmer,
          analysisCount,
        };
      })
    );

    res.json({
      success: true,
      farmers: farmersWithCount,
    });
  } catch (error) {
    console.error("Fetch farmers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch farmers",
    });
  }
});

// Get all soil analyses with farmer names
app.get("/api/admin/analyses", isAdmin, async (req, res) => {
  try {
    const analyses = await SoilAnalysis.find()
      .sort({ analysisDate: -1 })
      .populate("farmerId", "fullName email")
      .lean();

    const analysesWithFarmer = analyses.map((analysis) => ({
      ...analysis,
      farmerName: analysis.farmerId?.fullName || "Unknown",
      farmerEmail: analysis.farmerId?.email || "N/A",
    }));

    res.json({
      success: true,
      analyses: analysesWithFarmer,
    });
  } catch (error) {
    console.error("Fetch analyses error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analyses",
    });
  }
});

// Get comprehensive statistics for admin dashboard
app.get("/api/admin/statistics", isAdmin, async (req, res) => {
  try {
    // Total farmers
    const totalFarmers = await Farmer.countDocuments();
    const activeFarmers = await Farmer.countDocuments({ isActive: true });

    // Total analyses
    const totalAnalyses = await SoilAnalysis.countDocuments();
    const archivedReports = await SoilAnalysis.countDocuments({
      isArchived: true,
    });

    // Total area analyzed
    const areaResult = await SoilAnalysis.aggregate([
      {
        $group: {
          _id: null,
          totalArea: { $sum: "$boundary.area" },
        },
      },
    ]);
    const totalArea = areaResult[0]?.totalArea || 0;

    // Farm size distribution
    const farmSizeDistribution = await Farmer.aggregate([
      {
        $group: {
          _id: "$farmSize",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Soil type distribution
    const soilTypeDistribution = await SoilAnalysis.aggregate([
      {
        $group: {
          _id: "$soilProperties.soilType",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Registration trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const registrationTrend = await Farmer.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      {
        $project: {
          month: {
            $concat: [
              {
                $arrayElemAt: [
                  [
                    "",
                    "Jan",
                    "Feb",
                    "Mar",
                    "Apr",
                    "May",
                    "Jun",
                    "Jul",
                    "Aug",
                    "Sep",
                    "Oct",
                    "Nov",
                    "Dec",
                  ],
                  "$_id.month",
                ],
              },
              " ",
              { $toString: "$_id.year" },
            ],
          },
          count: 1,
        },
      },
    ]);

    // Top recommended crops
    const topCrops = await SoilAnalysis.aggregate([
      {
        $group: {
          _id: "$cropRecommendation.primaryCrop.name",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 8 },
      {
        $project: {
          crop: "$_id",
          count: 1,
          _id: 0,
        },
      },
    ]);

    // Average pH by region
    const phByRegion = await SoilAnalysis.aggregate([
      {
        $lookup: {
          from: "farmers",
          localField: "farmerId",
          foreignField: "_id",
          as: "farmer",
        },
      },
      { $unwind: "$farmer" },
      {
        $group: {
          _id: "$farmer.location",
          avgPh: { $avg: "$soilProperties.pH" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $project: {
          location: "$_id",
          avgPh: { $round: ["$avgPh", 2] },
          _id: 0,
        },
      },
    ]);

    // NPK averages
    const npkResult = await SoilAnalysis.aggregate([
      {
        $group: {
          _id: null,
          nitrogen: { $avg: "$soilProperties.nitrogen" },
          phosphorus: { $avg: "$soilProperties.phosphorus" },
          potassium: { $avg: "$soilProperties.potassium" },
          organicCarbon: { $avg: "$soilProperties.organicCarbon" },
        },
      },
    ]);
    const npkAverages = npkResult[0] || {
      nitrogen: 0,
      phosphorus: 0,
      potassium: 0,
      organicCarbon: 0,
    };

    // Seasonal data
    const seasonalData = await SoilAnalysis.aggregate([
      {
        $group: {
          _id: "$season",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      {
        $project: {
          season: "$_id",
          count: 1,
          _id: 0,
        },
      },
    ]);

    // Soil health distribution
    const soilHealthDistribution = await SoilAnalysis.aggregate([
      {
        $group: {
          _id: "$soilHealth",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Download and view statistics
    const downloadStats = await SoilAnalysis.aggregate([
      {
        $group: {
          _id: null,
          totalDownloads: { $sum: "$downloadCount" },
          totalViews: {
            $sum: { $cond: ["$reportViewed", 1, 0] },
          },
        },
      },
    ]);

    res.json({
      success: true,
      stats: {
        totalFarmers,
        activeFarmers,
        totalAnalyses,
        totalArea: totalArea.toFixed(2),
        archivedReports,
        totalDownloads: downloadStats[0]?.totalDownloads || 0,
        totalViews: downloadStats[0]?.totalViews || 0,
        farmSizeDistribution,
        soilTypeDistribution,
        registrationTrend,
        topCrops,
        phByRegion,
        npkAverages,
        seasonalData,
        soilHealthDistribution,
      },
    });
  } catch (error) {
    console.error("Statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    });
  }
});

// Get single farmer details with all analyses
app.get("/api/admin/farmer/:id", isAdmin, async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id)
      .select("-password")
      .lean();

    if (!farmer) {
      return res.status(404).json({
        success: false,
        message: "Farmer not found",
      });
    }

    const analysisCount = await SoilAnalysis.countDocuments({
      farmerId: farmer._id,
    });

    res.json({
      success: true,
      farmer,
      analysisCount,
    });
  } catch (error) {
    console.error("Fetch farmer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch farmer details",
    });
  }
});

// Get single analysis details with farmer info
app.get("/api/admin/analysis/:id", isAdmin, async (req, res) => {
  try {
    const analysis = await SoilAnalysis.findById(req.params.id)
      .populate("farmerId", "fullName email phone location")
      .lean();

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: "Analysis not found",
      });
    }

    res.json({
      success: true,
      analysis: {
        ...analysis,
        farmerName: analysis.farmerId?.fullName || "Unknown",
        farmerEmail: analysis.farmerId?.email || "N/A",
      },
    });
  } catch (error) {
    console.error("Fetch analysis error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analysis details",
    });
  }
});

// Delete farmer (and all their analyses)
app.delete("/api/admin/farmer/:id", isAdmin, async (req, res) => {
  try {
    const farmer = await Farmer.findByIdAndDelete(req.params.id);

    if (!farmer) {
      return res.status(404).json({
        success: false,
        message: "Farmer not found",
      });
    }

    // Delete all analyses for this farmer
    await SoilAnalysis.deleteMany({ farmerId: req.params.id });

    res.json({
      success: true,
      message: "Farmer and all associated data deleted successfully",
    });
  } catch (error) {
    console.error("Delete farmer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete farmer",
    });
  }
});

// Delete analysis
app.delete("/api/admin/analysis/:id", isAdmin, async (req, res) => {
  try {
    const analysis = await SoilAnalysis.findByIdAndDelete(req.params.id);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: "Analysis not found",
      });
    }

    res.json({
      success: true,
      message: "Analysis deleted successfully",
    });
  } catch (error) {
    console.error("Delete analysis error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete analysis",
    });
  }
});

// Update farmer details
app.put("/api/admin/farmer/:id", isAdmin, async (req, res) => {
  try {
    const { fullName, email, phone, location, farmSize, isActive, notes } =
      req.body;

    const updatedFarmer = await Farmer.findByIdAndUpdate(
      req.params.id,
      { fullName, email, phone, location, farmSize, isActive, notes },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedFarmer) {
      return res.status(404).json({
        success: false,
        message: "Farmer not found",
      });
    }

    res.json({
      success: true,
      message: "Farmer updated successfully",
      farmer: updatedFarmer,
    });
  } catch (error) {
    console.error("Update farmer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update farmer",
    });
  }
});

// Generate comprehensive system report
app.get("/api/admin/generate-report", isAdmin, async (req, res) => {
  try {
    const farmers = await Farmer.find().select("-password").lean();
    const analyses = await SoilAnalysis.find()
      .populate("farmerId", "fullName email")
      .lean();

    // Generate PDF report (you'll need to implement this using pdfGenerator)
    const reportData = {
      generatedAt: new Date(),
      totalFarmers: farmers.length,
      totalAnalyses: analyses.length,
      farmers,
      analyses,
    };

    // For now, return JSON. Implement PDF generation similar to other reports
    res.json({
      success: true,
      report: reportData,
    });
  } catch (error) {
    console.error("Generate report error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate report",
    });
  }
});

// Toggle farmer active status
app.patch("/api/admin/farmer/:id/toggle-status", isAdmin, async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id);

    if (!farmer) {
      return res.status(404).json({
        success: false,
        message: "Farmer not found",
      });
    }

    farmer.isActive = !farmer.isActive;
    await farmer.save();

    res.json({
      success: true,
      message: `Farmer ${
        farmer.isActive ? "activated" : "deactivated"
      } successfully`,
      isActive: farmer.isActive,
    });
  } catch (error) {
    console.error("Toggle status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle farmer status",
    });
  }
});

// Admin Logout
app.get("/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Admin logout error:", err);
    }
    res.redirect("/admin/login");
  });
});

// Bulk operations
app.post("/api/admin/bulk-delete-farmers", isAdmin, async (req, res) => {
  try {
    const { farmerIds } = req.body;

    if (!farmerIds || !Array.isArray(farmerIds)) {
      return res.status(400).json({
        success: false,
        message: "Invalid farmer IDs",
      });
    }

    // Delete farmers and their analyses
    await Farmer.deleteMany({ _id: { $in: farmerIds } });
    await SoilAnalysis.deleteMany({ farmerId: { $in: farmerIds } });

    res.json({
      success: true,
      message: `${farmerIds.length} farmers and their data deleted successfully`,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete farmers",
    });
  }
});

app.post("/api/admin/bulk-delete-analyses", isAdmin, async (req, res) => {
  try {
    const { analysisIds } = req.body;

    if (!analysisIds || !Array.isArray(analysisIds)) {
      return res.status(400).json({
        success: false,
        message: "Invalid analysis IDs",
      });
    }

    await SoilAnalysis.deleteMany({ _id: { $in: analysisIds } });

    res.json({
      success: true,
      message: `${analysisIds.length} analyses deleted successfully`,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete analyses",
    });
  }
});

app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).send("Something went wrong!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Soily server running on port ${PORT}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
});
