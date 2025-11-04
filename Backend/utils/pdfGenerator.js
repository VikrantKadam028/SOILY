const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class SoilReportPDFGenerator {
  constructor() {
    this.primaryColor = '#25995c';
    this.lightGreen = '#f0fdf4';
    this.darkGreen = '#007236';
    this.textDark = '#1f2937';
    this.textLight = '#6b7280';
    this.borderColor = '#e5e7eb';
    this.accentColor = '#22c55e';
    this.useFallbackFonts = false;
    this.pageHeight = 842;
    this.bottomMargin = 60;
  }

  async generateSingleReport(analysis, farmer) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 60, left: 40, right: 40 }
        });

        this.registerPoppinsFont(doc);

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        let currentY = 40;

        // Header with Logo
        currentY = this.addProfessionalHeader(doc, 'SOIL ANALYSIS REPORT', currentY);
        
        // Farmer Information Table
        currentY = this.addCompactTable(doc, 'FARMER INFORMATION', [
          { label: 'Farmer Name', value: farmer.fullName },
          { label: 'Location', value: farmer.location },
          { label: 'Farm Size', value: this.getFarmSizeDescription(farmer.farmSize) },
          { label: 'Analysis Date', value: new Date(analysis.analysisDate).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric'
          })},
          { label: 'Season', value: analysis.season }
        ], currentY);

        currentY += 10;

        // Farm Boundary Details
        currentY = this.addCompactTable(doc, 'FARM BOUNDARY DETAILS', [
          { label: 'Area', value: `${analysis.boundary.area.toFixed(2)} acres` },
          { label: 'Perimeter', value: `${analysis.boundary.perimeter.toFixed(2)} km` },
          { label: 'Center Coordinates', value: `${analysis.boundary.centerPoint.latitude.toFixed(6)}°N, ${analysis.boundary.centerPoint.longitude.toFixed(6)}°E` },
          { label: 'Boundary Points', value: analysis.boundary.coordinates.length }
        ], currentY);

        currentY += 10;

        // Soil Properties Analysis
        currentY = this.addCompactTable(doc, 'SOIL PROPERTIES ANALYSIS', [
          { label: 'Soil Type', value: analysis.soilProperties.soilType },
          { label: 'pH Level', value: analysis.soilProperties.pH.toFixed(2) },
          { label: 'Organic Carbon', value: `${analysis.soilProperties.organicCarbon.toFixed(2)} g/kg` },
          { label: 'Clay Content', value: `${analysis.soilProperties.clay.toFixed(1)}%` },
          { label: 'Sand Content', value: analysis.soilProperties.sand ? `${analysis.soilProperties.sand.toFixed(1)}%` : 'N/A' },
          { label: 'Bulk Density', value: analysis.soilProperties.bulkDensity ? `${analysis.soilProperties.bulkDensity} g/cm³` : 'N/A' }
        ], currentY);

        currentY += 10;

        // NPK Analysis with Status
        currentY = this.addNPKTable(doc, analysis.soilProperties, currentY);

        currentY += 10;

        // Climate Conditions
        currentY = this.addCompactTable(doc, 'CLIMATE CONDITIONS', [
          { label: 'Average Rainfall', value: `${analysis.climateData.rainfall} mm` },
          { label: 'Average Temperature', value: `${analysis.climateData.temperature}°C` }
        ], currentY);

        currentY += 15;

        // TWO COLUMN LAYOUT: Soil Health + Crop Recommendation
        currentY = this.addTwoColumnHealthAndCrops(doc, analysis, currentY);

        // Add footer
        this.addFooter(doc, 1, 1);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateMultipleReports(analyses, farmer) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 60, left: 40, right: 40 }
        });

        this.registerPoppinsFont(doc);

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Cover Page
        this.addCoverPage(doc, farmer, analyses.length);
        
        // Individual Reports
        analyses.forEach((analysis, index) => {
          doc.addPage();

          let currentY = 40;

          // Header
          currentY = this.addProfessionalHeader(doc, `SOIL ANALYSIS REPORT - ${index + 1}/${analyses.length}`, currentY);
          
          // Compact farmer info
          currentY = this.addCompactTable(doc, 'BASIC INFORMATION', [
            { label: 'Farmer', value: farmer.fullName },
            { label: 'Date', value: new Date(analysis.analysisDate).toLocaleDateString('en-IN') },
            { label: 'Area', value: `${analysis.boundary.area.toFixed(2)} acres` },
            { label: 'Soil Type', value: analysis.soilProperties.soilType }
          ], currentY);

          currentY += 10;

          // NPK Analysis
          currentY = this.addNPKTable(doc, analysis.soilProperties, currentY);

          currentY += 15;

          // TWO COLUMN LAYOUT: Soil Health + Crop Recommendation
          currentY = this.addTwoColumnHealthAndCrops(doc, analysis, currentY);

          // Footer
          this.addFooter(doc, index + 2, analyses.length + 1);
        });
        
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Two Column Layout: Soil Health Assessment + Crop Recommendation
   */
  addTwoColumnHealthAndCrops(doc, analysis, startY) {
    const pageWidth = 595;
    const contentWidth = pageWidth - 80;
    const columnGap = 10;
    const columnWidth = (contentWidth - columnGap) / 2;
    
    const leftX = 40;
    const rightX = 40 + columnWidth + columnGap;
    
    let y = startY;

    // === LEFT COLUMN: SOIL HEALTH ASSESSMENT ===
    const healthColor = this.getHealthColor(analysis.soilHealth);
    
    // Health card background
    doc.rect(leftX, y, columnWidth, 110)
       .fill(this.lightGreen)
       .strokeColor(this.primaryColor)
       .lineWidth(1)
       .stroke();

    // Health title
    doc.fillColor(this.primaryColor)
       .fontSize(10)
       .font(this.getFont('bold'))
       .text('SOIL HEALTH', leftX + 10, y + 10, { width: columnWidth - 20 });

    // Status with colored dot
    const dotX = leftX + 10;
    const dotY = y + 32;
    doc.circle(dotX, dotY, 4)
       .fill(healthColor);
    
    doc.fillColor(this.textDark)
       .fontSize(11)
       .font(this.getFont('bold'))
       .text(analysis.soilHealth, dotX + 12, y + 28, { width: columnWidth - 30 });

    // Fertility rating text
    doc.fillColor(this.textLight)
       .fontSize(8)
       .font(this.getFont('normal'))
       .text(`Fertility Rating`, leftX + 10, y + 50, { width: columnWidth - 20 });

    // Large rating number
    doc.fillColor(healthColor)
       .fontSize(28)
       .font(this.getFont('bold'))
       .text(analysis.fertilityRating.toFixed(1), leftX + 10, y + 63);

    doc.fillColor(this.textLight)
       .fontSize(12)
       .font(this.getFont('normal'))
       .text('/10', leftX + 55, y + 75);

    // Progress bar
    const barWidth = columnWidth - 90;
    const barHeight = 6;
    const progressWidth = (analysis.fertilityRating / 10) * barWidth;
    const barX = leftX + 90;
    const barY = y + 80;
    
    doc.rect(barX, barY, barWidth, barHeight)
       .fill('#e5e7eb');
    
    doc.rect(barX, barY, progressWidth, barHeight)
       .fill(healthColor);

    // === RIGHT COLUMN: CROP RECOMMENDATION ===
    const cropRec = analysis.cropRecommendation;
    
    // Crop recommendation background
    doc.rect(rightX, y, columnWidth, 110)
       .fill(this.lightGreen)
       .strokeColor(this.primaryColor)
       .lineWidth(1)
       .stroke();

    // Crop title
    doc.fillColor(this.primaryColor)
       .fontSize(10)
       .font(this.getFont('bold'))
       .text('🌾 RECOMMENDED', rightX + 10, y + 10, { width: columnWidth - 20 });

    // Primary crop name
    doc.fillColor(this.darkGreen)
       .fontSize(13)
       .font(this.getFont('bold'))
       .text(cropRec.primaryCrop.name, rightX + 10, y + 28, { 
         width: columnWidth - 20,
         ellipsis: true 
       });

    // Match score
    doc.fillColor(this.textDark)
       .fontSize(8)
       .font(this.getFont('normal'))
       .text(`Match Score: ${cropRec.primaryCrop.matchScore.toFixed(0)}%`, rightX + 10, y + 48);

    // Fertilizer
    doc.fillColor(this.textDark)
       .fontSize(8)
       .font(this.getFont('normal'))
       .text(`Fertilizer: ${cropRec.primaryCrop.fertilizer}`, rightX + 10, y + 62, { 
         width: columnWidth - 20,
         ellipsis: true 
       });

    // Alternative crops - compact list
    if (cropRec.alternativeCrops && cropRec.alternativeCrops.length > 0) {
      doc.fillColor(this.textLight)
         .fontSize(7)
         .font(this.getFont('bold'))
         .text('Alternatives:', rightX + 10, y + 80);

      const cropsToShow = Math.min(cropRec.alternativeCrops.length, 3);
      cropRec.alternativeCrops.slice(0, cropsToShow).forEach((crop, index) => {
        doc.fillColor(this.textDark)
           .fontSize(7)
           .font(this.getFont('normal'))
           .text(`${index + 1}. ${crop.name} (${crop.matchScore.toFixed(0)}%)`, 
                  rightX + 10, y + 90 + (index * 8), { 
             width: columnWidth - 20,
             ellipsis: true 
           });
      });
    }

    return y + 120;
  }

  /**
   * Check if content fits on current page, add page if needed
   */
  checkPageBreak(doc, currentY, requiredHeight) {
    if (currentY + requiredHeight > this.pageHeight - this.bottomMargin) {
      doc.addPage();
      return 40;
    }
    return currentY;
  }

  /**
   * Register Poppins font if available
   */
  registerPoppinsFont(doc) {
    const fontsDir = path.join(__dirname, '../fonts');
    const poppinsNormal = path.join(fontsDir, 'Poppins-Regular.ttf');
    const poppinsBold = path.join(fontsDir, 'Poppins-Bold.ttf');
    const poppinsMedium = path.join(fontsDir, 'Poppins-Medium.ttf');

    try {
      if (fs.existsSync(poppinsNormal) && fs.existsSync(poppinsBold)) {
        doc.registerFont('Poppins', poppinsNormal);
        doc.registerFont('Poppins-Bold', poppinsBold);
        if (fs.existsSync(poppinsMedium)) {
          doc.registerFont('Poppins-Medium', poppinsMedium);
        }
      } else {
        this.useFallbackFonts = true;
      }
    } catch (error) {
      this.useFallbackFonts = true;
    }
  }

  /**
   * Get font family with Poppins fallback
   */
  getFont(fontType = 'normal') {
    if (this.useFallbackFonts) {
      const fallbackFonts = {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        medium: 'Helvetica'
      };
      return fallbackFonts[fontType] || fallbackFonts.normal;
    }

    const fonts = {
      normal: 'Poppins',
      bold: 'Poppins-Bold',
      medium: 'Poppins-Medium'
    };

    return fonts[fontType] || fonts.normal;
  }

  /**
   * Add professional header with logo
   */
  addProfessionalHeader(doc, title, startY) {
    const pageWidth = 595;
    const contentWidth = pageWidth - 80;

    try {
      const logoPaths = [
        path.join(__dirname, '../../Frontend/public/logo1.png'),
        path.join(__dirname, '../../public/logo1.png'),
        path.join(__dirname, '../public/logo1.png'),
        path.join(process.cwd(), 'public/logo1.png'),
        path.join(process.cwd(), 'logo1.png'),
      ];

      let logoLoaded = false;
      for (const logoPath of logoPaths) {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 40, startY, { width: 60, height: 45 });
          logoLoaded = true;
          break;
        }
      }

      if (!logoLoaded) {
        doc.rect(40, startY, 60, 45)
           .fill(this.primaryColor);
        doc.fillColor('#ffffff')
           .fontSize(14)
           .font(this.getFont('bold'))
           .text('SOILY', 40, startY + 15, { width: 60, align: 'center' });
      }
    } catch (error) {
      doc.rect(40, startY, 60, 45)
         .fill(this.primaryColor);
      doc.fillColor('#ffffff')
         .fontSize(14)
         .font(this.getFont('bold'))
         .text('SOILY', 40, startY + 15, { width: 60, align: 'center' });
    }

    // Title and subtitle
    doc.fillColor(this.primaryColor)
       .fontSize(16)
       .font(this.getFont('bold'))
       .text(title, 115, startY + 5, { width: contentWidth - 75 });

    doc.fillColor(this.textLight)
       .fontSize(9)
       .font(this.getFont('normal'))
       .text('Digital Soil Mapping & Crop Recommendation Platform', 115, startY + 25);

    doc.fillColor(this.textLight)
       .fontSize(8)
       .text('Using Satellite Imagery for Western Maharashtra', 115, startY + 37);

    // Separator line
    doc.moveTo(40, startY + 55)
       .lineTo(pageWidth - 40, startY + 55)
       .strokeColor(this.borderColor)
       .lineWidth(1)
       .stroke();

    return startY + 65;
  }

  /**
   * Add compact table with better formatting
   */
  addCompactTable(doc, title, rows, startY) {
    const pageWidth = 595;
    const tableWidth = pageWidth - 80;
    const labelWidth = tableWidth * 0.4;
    const valueWidth = tableWidth * 0.6;

    // Table header with light green background
    doc.rect(40, startY, tableWidth, 20)
       .fill(this.lightGreen);

    doc.fillColor(this.primaryColor)
       .fontSize(10)
       .font(this.getFont('bold'))
       .text(title, 50, startY + 7);

    let y = startY + 20;

    // Table rows
    rows.forEach((row, index) => {
      const bgColor = index % 2 === 0 ? '#ffffff' : '#f8fafc';
      
      // Row background
      doc.rect(40, y, tableWidth, 18)
         .fill(bgColor);

      // Border
      doc.rect(40, y, tableWidth, 18)
         .strokeColor(this.borderColor)
         .lineWidth(0.5)
         .stroke();

      // Label
      doc.fillColor(this.textDark)
         .fontSize(9)
         .font(this.getFont('medium'))
         .text(row.label, 50, y + 5, { width: labelWidth - 10 });

      // Value
      doc.fillColor(this.textDark)
         .fontSize(9)
         .font(this.getFont('normal'))
         .text(row.value, 40 + labelWidth, y + 5, { width: valueWidth - 10 });

      y += 18;
    });

    return y;
  }

  /**
   * Add NPK table with status indicators
   */
  addNPKTable(doc, soilProperties, startY) {
    const pageWidth = 595;
    const tableWidth = pageWidth - 80;
    const col1Width = tableWidth * 0.3;
    const col2Width = tableWidth * 0.3;
    const col3Width = tableWidth * 0.4;

    // Table header
    doc.rect(40, startY, tableWidth, 20)
       .fill(this.lightGreen);

    doc.fillColor(this.primaryColor)
       .fontSize(10)
       .font(this.getFont('bold'))
       .text('NPK ANALYSIS', 50, startY + 7);

    // Column headers
    doc.fillColor(this.textDark)
       .fontSize(8)
       .font(this.getFont('bold'))
       .text('NUTRIENT', 50, startY + 25, { width: col1Width - 10 })
       .text('VALUE', 40 + col1Width, startY + 25, { width: col2Width - 10 })
       .text('STATUS', 40 + col1Width + col2Width, startY + 25, { width: col3Width - 10 });

    let y = startY + 20;

    const npkData = [
      { 
        nutrient: 'Nitrogen (N)', 
        value: `${soilProperties.nitrogen.toFixed(2)} kg/ha`,
        status: this.getNPKStatus(soilProperties.nitrogen, 'N')
      },
      { 
        nutrient: 'Phosphorus (P)', 
        value: `${soilProperties.phosphorus.toFixed(0)} kg/ha`,
        status: this.getNPKStatus(soilProperties.phosphorus, 'P')
      },
      { 
        nutrient: 'Potassium (K)', 
        value: `${soilProperties.potassium.toFixed(0)} kg/ha`,
        status: this.getNPKStatus(soilProperties.potassium, 'K')
      }
    ];

    npkData.forEach((item, index) => {
      const bgColor = index % 2 === 0 ? '#ffffff' : '#f8fafc';
      y += 18;

      // Row background
      doc.rect(40, y, tableWidth, 18)
         .fill(bgColor);

      // Border
      doc.rect(40, y, tableWidth, 18)
         .strokeColor(this.borderColor)
         .lineWidth(0.5)
         .stroke();

      // Nutrient
      doc.fillColor(this.textDark)
         .fontSize(9)
         .font(this.getFont('medium'))
         .text(item.nutrient, 50, y + 5, { width: col1Width - 10 });

      // Value
      doc.fillColor(this.textDark)
         .fontSize(9)
         .font(this.getFont('normal'))
         .text(item.value, 40 + col1Width, y + 5, { width: col2Width - 10 });

      // Status with colored indicator
      const statusColor = this.getStatusColor(item.status);
      doc.fillColor(statusColor)
         .fontSize(8)
         .font(this.getFont('bold'))
         .text(item.status, 40 + col1Width + col2Width, y + 5, { width: col3Width - 10 });
    });

    return y + 18;
  }

  /**
   * Add cover page for multiple reports
   */
  addCoverPage(doc, farmer, reportCount) {
    // Background
    doc.rect(0, 0, 595, 842)
       .fill(this.lightGreen);

    try {
      const logoPaths = [
        path.join(__dirname, '../../Frontend/public/logo1.png'),
        path.join(__dirname, '../../public/logo1.png'),
        path.join(process.cwd(), 'public/logo1.png'),
        path.join(process.cwd(), 'logo1.png')
      ];

      let logoLoaded = false;
      for (const logoPath of logoPaths) {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 222.5, 200, { width: 150, height: 120 });
          logoLoaded = true;
          break;
        }
      }

      if (!logoLoaded) {
        doc.rect(222.5, 200, 150, 120)
           .fill(this.primaryColor);
        doc.fillColor('#ffffff')
           .fontSize(32)
           .font(this.getFont('bold'))
           .text('SOILY', 222.5, 240, { width: 150, align: 'center' });
      }
    } catch (error) {
      doc.rect(222.5, 200, 150, 120)
         .fill(this.primaryColor);
      doc.fillColor('#ffffff')
         .fontSize(32)
         .font(this.getFont('bold'))
         .text('SOILY', 222.5, 240, { width: 150, align: 'center' });
    }

    // Title
    doc.fillColor(this.primaryColor)
       .fontSize(24)
       .font(this.getFont('bold'))
       .text('SOIL ANALYSIS REPORTS', 50, 380, { width: 495, align: 'center' });
    
    doc.fontSize(18)
       .text('COMPILATION REPORT', 50, 410, { width: 495, align: 'center' });

    // Info box
    doc.rect(120, 480, 355, 100)
       .fill('#ffffff')
       .strokeColor(this.primaryColor)
       .lineWidth(2)
       .stroke();

    doc.fillColor(this.textDark)
       .fontSize(16)
       .font(this.getFont('bold'))
       .text(farmer.fullName, 120, 500, { width: 355, align: 'center' });
    
    doc.fontSize(12)
       .font(this.getFont('normal'))
       .text(farmer.location, 120, 530, { width: 355, align: 'center' });
    
    doc.fontSize(11)
       .fillColor(this.textLight)
       .text(`Total Reports: ${reportCount}`, 120, 555, { width: 355, align: 'center' });
  }

  /**
   * Add professional footer
   */
  addFooter(doc, currentPage, totalPages) {
    const pageHeight = 842;
    
    // Footer line
    doc.moveTo(40, pageHeight - 40)
       .lineTo(555, pageHeight - 40)
       .strokeColor(this.borderColor)
       .lineWidth(0.5)
       .stroke();
    
    // Footer text
    doc.fillColor(this.textLight)
       .fontSize(8)
       .font(this.getFont('normal'))
       .text(
         `SOILY - Digital Soil Mapping Platform | Generated: ${new Date().toLocaleDateString('en-IN')}`,
         40,
         pageHeight - 30,
         { width: 400 }
       );
    
    // Page number
    doc.text(
      `Page ${currentPage} of ${totalPages}`,
      450,
      pageHeight - 30,
      { width: 105, align: 'right' }
    );
  }

  /**
   * Helper methods
   */
  getFarmSizeDescription(size) {
    const descriptions = {
      small: 'Small (< 2 acres)',
      medium: 'Medium (2-10 acres)',
      large: 'Large (10-50 acres)',
      xlarge: 'Extra Large (> 50 acres)'
    };
    return descriptions[size] || size;
  }

  getNPKStatus(value, element) {
    if (element === 'N') {
      if (value < 0.3) return 'Low';
      if (value > 0.7) return 'Good';
      return 'Medium';
    }
    if (element === 'P') {
      if (value < 30) return 'Low';
      if (value > 50) return 'Good';
      return 'Medium';
    }
    if (element === 'K') {
      if (value < 120) return 'Low';
      if (value > 180) return 'Good';
      return 'Medium';
    }
    return 'Medium';
  }

  getStatusColor(status) {
    const colors = {
      'Low': '#ef4444',
      'Medium': '#f59e0b',
      'Good': '#10b981'
    };
    return colors[status] || this.textLight;
  }

  getHealthColor(health) {
    const colors = {
      'Excellent': '#10b981',
      'Good': '#22c55e',
      'Fair': '#f59e0b',
      'Poor': '#ef4444',
      'Critical': '#dc2626'
    };
    return colors[health] || this.textLight;
  }
}

module.exports = new SoilReportPDFGenerator();
