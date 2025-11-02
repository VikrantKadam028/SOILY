const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
require("dotenv").config();

const app = express();
app.set('trust proxy', 1);

const Farmer = require("./models/Farmer");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../Frontend/views"));
app.use(express.static(path.join(__dirname, "../Frontend/public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "soily-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl:
        process.env.MONGO_URI,
      touchAfter: 24 * 3600,
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", 
    },
  })
);

mongoose
  .connect(
    process.env.MONGO_URI,
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("✅ MongoDB connected to soilyFinal database"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

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

app.get("/", (req, res) => {
  if (req.session.farmerId) {
    res.redirect("/dashboard");
  } else {
    res.redirect("/auth/login");
  }
});

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

// Auth Routes - Register
app.get("/auth/register", (req, res) => {
  if (req.session.farmerId) {
    return res.redirect("/dashboard");
  }
  res.render("auth/register", { error: null });
});

app.post("/auth/register", async (req, res) => {
  try {
    const { fullName, email, phone, location, farmSize, password, language } =
      req.body;

    // Validate required fields
    if (!fullName || !email || !phone || !location || !farmSize || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        field: "email",
        message: "Invalid email format",
      });
    }

    // Validate phone format (Indian phone numbers)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ""))) {
      return res.status(400).json({
        success: false,
        field: "phone",
        message: "Invalid phone number format",
      });
    }

    // Check if email already exists
    const existingEmail = await Farmer.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        field: "email",
        message: "Email already registered",
      });
    }

    // Check if phone already exists
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

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        field: "password",
        message: "Password must be at least 8 characters long",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new farmer
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

    // Handle validation errors
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

// Dashboard (protected route)
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

// API to update language preference
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

// API to get farmer profile
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

// API to update farmer profile
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

// API to update farm details
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

// API to change password
app.post("/api/farmer/change-password", isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const farmer = await Farmer.findById(req.session.farmerId);

    // Verify current password
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

// API to delete account
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

// Profile page route
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

app.get("/soil-map", isAuthenticated, async (req, res) => {
  const farmer = await Farmer.findById(req.session.farmerId);

  if (!farmer) {
    return res.redirect("/login");
  }

  res.render("templates/soil-map", { farmer });
});

const { GoogleAuth } = require("google-auth-library");
const axios = require("axios");
const eeProject = "projects/demoauth-fcf39"; // your GEE project ID

app.post("/api/analyze-field", isAuthenticated, async (req, res) => {
  try {
    const { coordinates } = req.body;

    if (!coordinates) {
      return res
        .status(400)
        .json({ success: false, message: "No coordinates provided" });
    }

    // Authenticate using service account
    const auth = new GoogleAuth({
      keyFile: path.join(__dirname, "./gee-service-key.json"),
      scopes: ["https://www.googleapis.com/auth/earthengine.readonly"],
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();

    // Build polygon for GEE
    const polygon = {
      type: "Polygon",
      coordinates: [coordinates],
    };

    // Request satellite thumbnail from GEE (Sentinel-2)
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

    // Convert raw image to Base64 to show on frontend
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


app.post("/sms", express.urlencoded({ extended: false }), async (req, res) => {
  const incomingMsg = req.body.Body?.toLowerCase();
  const fromNumber = req.body.From;

  console.log("📩 SMS received from:", fromNumber, "Message:", incomingMsg);

  let reply = "Please send in this format: CROP soilType=<type> location=<city>";

  if (incomingMsg.startsWith("crop")) {
    // Extract soil type and location
    const soilMatch = incomingMsg.match(/soiltype=([a-zA-Z]+)/);
    const locationMatch = incomingMsg.match(/location=([a-zA-Z]+)/);

    if (soilMatch && locationMatch) {
      const soilType = soilMatch[1];
      const location = locationMatch[1];

      // Simulated recommendation logic (replace with your real model)
      let recommendation = "";
      if (soilType === "loam") recommendation = "Cotton, Soybean";
      else if (soilType === "clay") recommendation = "Rice, Wheat";
      else recommendation = "Millet, Pulses";

      reply = `📍 Location: ${location}\n🌱 Soil: ${soilType}\n✅ Recommended Crops: ${recommendation}`;
    }
  }

  const twiml = `<Response><Message>${reply}</Message></Response>`;
  res.type("text/xml").send(twiml);
});



    
// 404 handler
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).send("Something went wrong!");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Soily server running on port ${PORT}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
});





