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
app.set('trust proxy', 1);
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

// Archive a Report
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
