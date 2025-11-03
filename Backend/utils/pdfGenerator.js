const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class SoilReportPDFGenerator {
  constructor() {
    this.primaryColor = '#25995c';
    this.secondaryColor = '#34d399';
    this.textDark = '#1f2937';
    this.textLight = '#6b7280';
    this.borderColor = '#e5e7eb';
  }

  /**
   * Generate a single soil analysis report PDF
   */
  async generateSingleReport(analysis, farmer) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header with Logo and Title
        this.addHeader(doc, 'Soil Analysis Report');
        
        // Farmer Information
        this.addFarmerInfo(doc, farmer, analysis.analysisDate);
        
        // Farm Boundary Details
        this.addSection(doc, 'Farm Boundary Details', 180);
        this.addBoundaryTable(doc, analysis.boundary);
        
        // Soil Properties
        this.addSection(doc, 'Soil Properties Analysis', doc.y + 30);
        this.addSoilPropertiesTable(doc, analysis.soilProperties);
        
        // NPK Values
        this.addSection(doc, 'NPK Analysis', doc.y + 30);
        this.addNPKTable(doc, analysis.soilProperties);
        
        // Climate Data
        this.addSection(doc, 'Climate Conditions', doc.y + 30);
        this.addClimateTable(doc, analysis.climateData);
        
        // Soil Health Assessment
        this.addSection(doc, 'Soil Health Assessment', doc.y + 30);
        this.addHealthAssessment(doc, analysis);
        
        // Crop Recommendations
        this.addSection(doc, 'Crop Recommendations', doc.y + 30);
        this.addCropRecommendations(doc, analysis.cropRecommendation);
        
        // Footer
        this.addFooter(doc);
        
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate multiple reports combined PDF
   */
  async generateMultipleReports(analyses, farmer) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Cover Page
        this.addCoverPage(doc, farmer, analyses.length);
        
        // Summary Page
        doc.addPage();
        this.addSummaryPage(doc, analyses, farmer);
        
        // Individual Reports
        analyses.forEach((analysis, index) => {
          doc.addPage();
          this.addHeader(doc, `Report ${index + 1} of ${analyses.length}`);
          this.addFarmerInfo(doc, farmer, analysis.analysisDate);
          this.addBoundaryTable(doc, analysis.boundary);
          
          this.addSection(doc, 'Soil Properties', doc.y + 20);
          this.addSoilPropertiesTable(doc, analysis.soilProperties);
          
          this.addSection(doc, 'NPK Analysis', doc.y + 20);
          this.addNPKTable(doc, analysis.soilProperties);
          
          this.addSection(doc, 'Crop Recommendation', doc.y + 20);
          this.addCropRecommendations(doc, analysis.cropRecommendation);
        });
        
        this.addFooter(doc);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add header with logo and title
   */
  addHeader(doc, title) {
    // Logo placeholder - replace with actual logo
    doc.rect(50, 40, 60, 60)
       .fillAndStroke(this.primaryColor, this.primaryColor);
    
    doc.fillColor('#ffffff')
       .fontSize(24)
       .font('Helvetica-Bold')
       .text('SOILY', 55, 60, { width: 50, align: 'center' });
    
    // Title
    doc.fillColor(this.primaryColor)
       .fontSize(20)
       .font('Helvetica-Bold')
       .text(title, 120, 50, { width: 400 });
    
    doc.fillColor(this.textLight)
       .fontSize(10)
       .font('Helvetica')
       .text('Digital Soil Mapping Using Satellite Imagery Platform', 120, 75);
    
    // Horizontal line
    doc.moveTo(50, 120)
       .lineTo(545, 120)
       .strokeColor(this.borderColor)
       .stroke();
  }

  /**
   * Add farmer information
   */
  addFarmerInfo(doc, farmer, analysisDate) {
    const startY = 140;
    
    doc.fillColor(this.textDark)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Farmer Information', 50, startY);
    
    doc.fontSize(10)
       .font('Helvetica');
    
    const info = [
      { label: 'Name:', value: farmer.fullName },
      { label: 'Location:', value: farmer.location },
      { label: 'Farm Size:', value: this.getFarmSizeDescription(farmer.farmSize) },
      { label: 'Analysis Date:', value: new Date(analysisDate).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }) }
    ];
    
    let y = startY + 20;
    info.forEach(item => {
      doc.fillColor(this.textLight)
         .text(item.label, 50, y, { width: 100, continued: true })
         .fillColor(this.textDark)
         .text(item.value, { width: 400 });
      y += 18;
    });
  }

  /**
   * Add section heading
   */
  addSection(doc, title, y) {
    doc.fillColor(this.primaryColor)
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(title, 50, y);
    
    doc.moveTo(50, y + 20)
       .lineTo(545, y + 20)
       .strokeColor(this.borderColor)
       .stroke();
  }

  /**
   * Add boundary details table
   */
  addBoundaryTable(doc, boundary) {
    const startY = doc.y + 10;
    const tableData = [
      { label: 'Area', value: `${boundary.area.toFixed(2)} acres` },
      { label: 'Perimeter', value: `${boundary.perimeter.toFixed(2)} km` },
      { label: 'Center Point', value: `${boundary.centerPoint.latitude.toFixed(6)}°N, ${boundary.centerPoint.longitude.toFixed(6)}°E` },
      { label: 'Number of Points', value: boundary.coordinates.length }
    ];
    
    this.createTable(doc, tableData, startY);
  }

  /**
   * Add soil properties table
   */
  addSoilPropertiesTable(doc, soilProperties) {
    const startY = doc.y + 10;
    const tableData = [
      { label: 'Soil Type', value: soilProperties.soilType },
      { label: 'pH Level', value: soilProperties.pH.toFixed(2) },
      { label: 'Organic Carbon', value: `${soilProperties.organicCarbon.toFixed(2)} g/kg` },
      { label: 'Clay Content', value: `${soilProperties.clay.toFixed(1)}%` }
    ];
    
    if (soilProperties.sand) {
      tableData.push({ label: 'Sand Content', value: `${soilProperties.sand.toFixed(1)}%` });
    }
    
    this.createTable(doc, tableData, startY);
  }

  /**
   * Add NPK table
   */
  addNPKTable(doc, soilProperties) {
    const startY = doc.y + 10;
    const tableData = [
      { 
        label: 'Nitrogen (N)', 
        value: `${soilProperties.nitrogen.toFixed(2)} kg/ha`,
        status: this.getNPKStatus(soilProperties.nitrogen, 'N')
      },
      { 
        label: 'Phosphorus (P)', 
        value: `${soilProperties.phosphorus.toFixed(0)} kg/ha`,
        status: this.getNPKStatus(soilProperties.phosphorus, 'P')
      },
      { 
        label: 'Potassium (K)', 
        value: `${soilProperties.potassium.toFixed(0)} kg/ha`,
        status: this.getNPKStatus(soilProperties.potassium, 'K')
      }
    ];
    
    this.createTableWithStatus(doc, tableData, startY);
  }

  /**
   * Add climate table
   */
  addClimateTable(doc, climateData) {
    const startY = doc.y + 10;
    const tableData = [
      { label: 'Average Rainfall', value: `${climateData.rainfall.toFixed(0)} mm` },
      { label: 'Average Temperature', value: `${climateData.temperature.toFixed(1)}°C` }
    ];
    
    this.createTable(doc, tableData, startY);
  }

  /**
   * Add health assessment
   */
  addHealthAssessment(doc, analysis) {
    const startY = doc.y + 10;
    
    // Health status box
    const healthColor = this.getHealthColor(analysis.soilHealth);
    doc.rect(50, startY, 495, 60)
       .fillAndStroke(healthColor + '20', healthColor);
    
    doc.fillColor(healthColor)
       .fontSize(16)
       .font('Helvetica-Bold')
       .text(`Soil Health: ${analysis.soilHealth}`, 60, startY + 15);
    
    doc.fillColor(this.textDark)
       .fontSize(10)
       .font('Helvetica')
       .text(`Fertility Rating: ${analysis.fertilityRating.toFixed(1)}/10`, 60, startY + 38);
    
    doc.y = startY + 70;
  }

  /**
   * Add crop recommendations
   */
  addCropRecommendations(doc, cropRecommendation) {
    const startY = doc.y + 10;
    
    // Primary crop box
    doc.rect(50, startY, 495, 80)
       .fillAndStroke(this.primaryColor + '10', this.primaryColor);
    
    doc.fillColor(this.primaryColor)
       .fontSize(14)
       .font('Helvetica-Bold')
       .text('Recommended Crop', 60, startY + 15);
    
    doc.fontSize(18)
       .text(cropRecommendation.primaryCrop.name, 60, startY + 35);
    
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor(this.textDark)
       .text(`Match Score: ${cropRecommendation.primaryCrop.matchScore.toFixed(0)}%`, 60, startY + 58);
    
    doc.text(`Fertilizer: ${cropRecommendation.primaryCrop.fertilizer}`, 250, startY + 58);
    
    // Alternative crops
    if (cropRecommendation.alternativeCrops && cropRecommendation.alternativeCrops.length > 0) {
      doc.y = startY + 100;
      doc.fillColor(this.textDark)
         .fontSize(11)
         .font('Helvetica-Bold')
         .text('Alternative Suitable Crops:', 50, doc.y);
      
      let altY = doc.y + 15;
      cropRecommendation.alternativeCrops.forEach((crop, index) => {
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor(this.textLight)
           .text(`${index + 1}. ${crop.name} (${crop.matchScore.toFixed(0)}% match)`, 60, altY);
        altY += 18;
      });
      
      doc.y = altY;
    }
  }

  /**
   * Add cover page for multiple reports
   */
  addCoverPage(doc, farmer, reportCount) {
    // Large logo
    doc.rect(200, 150, 150, 150)
       .fillAndStroke(this.primaryColor, this.primaryColor);
    
    doc.fillColor('#ffffff')
       .fontSize(48)
       .font('Helvetica-Bold')
       .text('SOILY', 200, 200, { width: 150, align: 'center' });
    
    // Title
    doc.fillColor(this.primaryColor)
       .fontSize(28)
       .font('Helvetica-Bold')
       .text('Soil Analysis Reports', 50, 350, { width: 495, align: 'center' });
    
    doc.fillColor(this.textDark)
       .fontSize(16)
       .font('Helvetica')
       .text(farmer.fullName, 50, 400, { width: 495, align: 'center' });
    
    doc.fillColor(this.textLight)
       .fontSize(12)
       .text(`${reportCount} Analysis Reports`, 50, 430, { width: 495, align: 'center' });
    
    doc.text(new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }), 50, 450, { width: 495, align: 'center' });
  }

  /**
   * Add summary page
   */
  addSummaryPage(doc, analyses, farmer) {
    this.addHeader(doc, 'Analysis Summary');
    
    // Calculate statistics
    const totalArea = analyses.reduce((sum, a) => sum + a.boundary.area, 0);
    const avgpH = analyses.reduce((sum, a) => sum + a.soilProperties.pH, 0) / analyses.length;
    const avgFertility = analyses.reduce((sum, a) => sum + a.fertilityRating, 0) / analyses.length;
    
    const cropFrequency = {};
    analyses.forEach(a => {
      const crop = a.cropRecommendation.primaryCrop.name;
      cropFrequency[crop] = (cropFrequency[crop] || 0) + 1;
    });
    
    const startY = 160;
    
    doc.fillColor(this.textDark)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Overall Statistics', 50, startY);
    
    const stats = [
      { label: 'Total Analyses:', value: analyses.length },
      { label: 'Total Area Analyzed:', value: `${totalArea.toFixed(2)} acres` },
      { label: 'Average Soil pH:', value: avgpH.toFixed(2) },
      { label: 'Average Fertility Rating:', value: `${avgFertility.toFixed(1)}/10` },
      { label: 'Date Range:', value: `${new Date(analyses[analyses.length - 1].analysisDate).toLocaleDateString()} - ${new Date(analyses[0].analysisDate).toLocaleDateString()}` }
    ];
    
    let y = startY + 25;
    stats.forEach(stat => {
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(this.textLight)
         .text(stat.label, 50, y, { width: 150, continued: true })
         .fillColor(this.textDark)
         .font('Helvetica-Bold')
         .text(stat.value);
      y += 20;
    });
    
    // Crop distribution
    y += 30;
    doc.fillColor(this.textDark)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Crop Recommendation Distribution', 50, y);
    
    y += 20;
    Object.entries(cropFrequency).forEach(([crop, count]) => {
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(this.textLight)
         .text(`${crop}:`, 50, y, { width: 200, continued: true })
         .fillColor(this.textDark)
         .font('Helvetica-Bold')
         .text(`${count} time(s) (${((count/analyses.length)*100).toFixed(0)}%)`);
      y += 18;
    });
  }


  addFooter(doc) {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    // Use the correct page index relative to the buffer start
    doc.switchToPage(pages.start + i);
    
    doc.fontSize(8)
       .fillColor(this.textLight)
       .text(
         `Generated by SOILY | ${new Date().toLocaleDateString()}`,
         50,
         doc.page.height - 50,
         { align: 'center', width: doc.page.width - 100 }
       );
    
    doc.text(
      `Page ${i + 1} of ${pages.count}`,
      0,
      doc.page.height - 30,
      { align: 'center' }
    );
  }
}

  /**
   * Create a simple table
   */
  createTable(doc, data, startY) {
    let y = startY;
    
    data.forEach(row => {
      // Background
      doc.rect(50, y, 495, 25)
         .fillAndStroke('#f9fafb', this.borderColor);
      
      // Label
      doc.fillColor(this.textLight)
         .fontSize(10)
         .font('Helvetica')
         .text(row.label, 60, y + 8, { width: 200 });
      
      // Value
      doc.fillColor(this.textDark)
         .font('Helvetica-Bold')
         .text(row.value, 270, y + 8, { width: 260 });
      
      y += 25;
    });
    
    doc.y = y + 10;
  }

  /**
   * Create table with status indicator
   */
  createTableWithStatus(doc, data, startY) {
    let y = startY;
    
    data.forEach(row => {
      doc.rect(50, y, 495, 25)
         .fillAndStroke('#f9fafb', this.borderColor);
      
      doc.fillColor(this.textLight)
         .fontSize(10)
         .font('Helvetica')
         .text(row.label, 60, y + 8, { width: 150 });
      
      doc.fillColor(this.textDark)
         .font('Helvetica-Bold')
         .text(row.value, 220, y + 8, { width: 150 });
      
      // Status indicator
      const statusColor = row.status === 'Good' ? '#10b981' : row.status === 'Low' ? '#ef4444' : '#f59e0b';
      doc.fillColor(statusColor)
         .fontSize(9)
         .font('Helvetica')
         .text(row.status, 400, y + 8);
      
      y += 25;
    });
    
    doc.y = y + 10;
  }

  /**
   * Helper: Get farm size description
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

  /**
   * Helper: Get NPK status
   */
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

  /**
   * Helper: Get health color
   */
  getHealthColor(health) {
    const colors = {
      'Excellent': '#10b981',
      'Good': '#22c55e',
      'Fair': '#f59e0b',
      'Poor': '#ef4444',
      'Critical': '#dc2626'
    };
    return colors[health] || '#6b7280';
  }
}

module.exports = new SoilReportPDFGenerator();
