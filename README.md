# SOILY - 🌾 Smart Crop Recommendation Using Digital Soil Mapping & Satellite Imagery For Western Maharashtra

<p align="center" style="background-color:white; padding:10px; border-radius:10px;">
  <img src="https://github.com/VikrantKadam028/SOILY/blob/main/Frontend/public/logo1.png?raw=true" alt="Soily Logo" width="40%">
</p>

Soily is a powerful digital soil mapping platform that leverages satellite imagery to analyze and predict soil properties such as pH, nutrients, and moisture content. Based on these insights, it provides smart crop recommendations along with the ideal fertilizer suggestions to enhance productivity and maintain soil health.

---
## - Key Features

✅ **Interactive Soil Mapping** — Draw your farm boundary and analyze soil condition instantly  
✅ **Real-Time Data Integration** — Uses APIs like *SoilGrids*, *Sentinel-2*, and *Landsat*  
✅ **Automatic Soil Parameter Extraction** — Get pH, NPK, moisture, organic carbon, etc.  
✅ **AI-Powered Crop Recommendations** — Suggests crops based on soil type & weather  
✅ **Multilingual Interface** — Auto-translates the entire site based on farmer’s preferred language  
✅ **Report Generation & Download** — Farmers can save and download soil analysis reports  
✅ **Responsive Dashboard** — Clean, modern UI using EJS + TailwindCSS  

---

## - System Architecture

            ┌──────────────────────────────────────────────┐
            │                  FRONTEND                    │
            │──────────────────────────────────────────────│
            │  EJS Templates + TailwindCSS                 │
            │  Responsive UI for farmers                   │
            │  Interactive map (Leaflet / Mapbox)          │
            └──────────────────────────────────────────────┘
                            │
                            ▼
            ┌──────────────────────────────────────────────┐
            │                BACKEND (Node.js)             │
            │──────────────────────────────────────────────│
            │ Express.js Server                            │
            │ API Integrations: SoilGrids, Sentinel-2, etc.│
            │ Dynamic Translation via LibreTranslate API   │
            └──────────────────────────────────────────────┘
                            │
                            ▼
            ┌──────────────────────────────────────────────┐
            │                 DATABASE                     │
            │──────────────────────────────────────────────│
            │ MongoDB + Mongoose ORM                       │
            │ Stores Farmer Info, Soil Data, Reports       │
            │ Tracks Preferred Language                    │
            └──────────────────────────────────────────────┘
                            │
                            ▼
            ┌──────────────────────────────────────────────┐
            │          DATA PROCESSING LAYER               │
            │──────────────────────────────────────────────│
            │ SoilGrids API → Soil parameters              │
            │ Sentinel-2 / Landsat → Satellite imagery     │
            │ Rainfall, Temperature → Weather APIs         │
            └──────────────────────────────────────────────┘
                            │
                            ▼
            ┌──────────────────────────────────────────────┐
            │             OUTPUT & REPORTS                 │
            │──────────────────────────────────────────────│
            │ Detailed soil report (pH, N, P, K, etc.)     │
            │ Recommended crops & fertilizers              │
            │ Downloadable report (PDF/Excel)              │
            └──────────────────────────────────────────────┘




---

## - System Components

| Component | Description |
|------------|-------------|
| **Frontend** | Built using EJS and TailwindCSS, providing a clean and responsive interface |
| **Backend** | Node.js and Express handle routing, soil data requests, and API integrations |
| **Database** | MongoDB stores farmer profiles, soil data, and preferred language |
| **Translation Engine** | Dynamic translation using LibreTranslate API based on preferredLanguage |
| **Map Integration** | Leaflet.js or Mapbox allows farmers to draw and select farm boundaries |
| **Data APIs** | SoilGrids (soil), Sentinel-2/Landsat (satellite imagery), OpenWeatherMap (climate) |
| **Report Generator** | Converts analysis results into downloadable reports |

---

## 📋 Example Output

### 🌾 Soil Analysis Results

| Parameter | Value |
|------------|--------|
| **Soil pH** | 6.9 pH |
| **Nitrogen (N)** | 1.9 kg/ha |
| **Phosphorus (P)** | 78 kg/ha |
| **Potassium (K)** | 192 kg/ha |
| **Soil Type** | Clay Loam |
| **Organic Carbon** | 19.2 g/kg |
| **Rainfall (avg)** | 759 mm |
| **Temperature (avg)** | 28.3°C |

---

### 🎨 Soil Color Analysis
> **Light Brown** — Moderate fertility, needs organic amendments.

---

### 🌱 Recommended Crops
| Crop | Match % |
|-------|----------|
| Groundnut | 67% ✅ |
| Tur (Pigeon Pea) | 61% |
| Ginger | 60% |
| Gram | 60% |
| Jowar | 59% |

---

## 🎯 Objectives

1. To provide farmers with easy-to-understand soil insights.  
2. To generate accurate soil analysis using real-time data sources.  
3. To suggest crops and fertilizers suited to the farm’s soil.  
4. To make agricultural decision-making data-driven.  
5. To support farmers across multiple languages for inclusivity.  

---

## - Tech Stack

| Layer | Technology |
|--------|-------------|
| **Frontend** | EJS, TailwindCSS, Leaflet.js |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB (Mongoose ORM) |
| **APIs Used** | SoilGrids, Sentinel-2, Landsat, OpenWeatherMap, LibreTranslate |
| **Authentication** | Express Sessions + bcrypt |
| **Hosting** | Render / Vercel / MongoDB Atlas |

---

<p>Made With 💚 For Farmers</p>
